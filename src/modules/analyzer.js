/**
 * Score Analyzer Module
 * Performs Type A (deterministic) and Type B (AI-assisted) analysis
 * 
 * 根据 MSS模型组合架构方案1-1.md 规范：
 * - Type A（确定性解析）：谱表结构、符头符干符尾、休止符、谱号、拍号、调号、时值、音高、附点、装饰音、连音线、弱起小节、方整性结构
 * - Type B（感知性判断）：旋律线、Bass Line、强拍位置、结构重要音（LOCKED）、节奏型、终止式、声部、乐句边界
 */

import { 
  getStrongBeats, 
  isStrongBeat, 
  pitchToMidi,
  RHYTHM_PATTERNS
} from '../knowledge/index.js'
import { 
  identifyMelodyLine, 
  identifyBassLine, 
  classifyVoicePart,
  isAIAvailable 
} from '../ai/index.js'
import { 
  detectAnacrusis, 
  markAnacrusisNotesAsLocked,
  getAnacrusisProtectionStrategy 
} from './anacrusis-detector.js'
import { 
  analyzeSquareStructure, 
  inferPhrasesFromMeasures,
  generatePhraseBoundariesFromStructure 
} from './square-structure-analyzer.js'
import { 
  detectPhraseBoundariesEnhanced,
  markPhraseEndingsAsLocked,
  getDefaultBoundaryConfig 
} from './phrase-boundary-detector.js'

/**
 * Analyze a parsed score
 * @param {Object} score - Parsed score
 * @param {string} scoreType - 'single-staff' or 'grand-staff'
 * @returns {Promise<Object>} Analyzed score
 */
export async function analyzeScore(score, scoreType) {
  const { metadata, measures } = score
  
  // Type A: Deterministic analysis
  const strongBeats = getStrongBeats(metadata.timeSignature)
  
  // 🆕 弱起小节检测
  const anacrusisInfo = detectAnacrusis(measures, metadata.timeSignature)
  
  // 🆕 方整性结构分析
  const inferredPhrases = inferPhrasesFromMeasures(measures, metadata.timeSignature)
  const squareStructure = analyzeSquareStructure(inferredPhrases)
  
  // Analyze each measure - 添加 measureNumber
  const analyzedMeasures = measures.map((measure, index) => {
    const measureNumber = measure.number || index + 1
    const analyzedNotes = measure.notes.map(note => ({
      ...note,
      measureNumber: measureNumber,
      voicePart: scoreType === 'grand-staff' ? classifyVoicePart(note) : undefined,
      isLocked: false,
      lockReason: undefined,
      lockPriority: undefined
    }))
    
    return {
      ...measure,
      number: measureNumber,
      notes: analyzedNotes
    }
  })
  
  // Type B: AI-assisted analysis
  const allNotes = analyzedMeasures.flatMap(m => m.notes)
  
  // 🆕 标记弱起小节音符为LOCKED（最高优先级）
  if (anacrusisInfo.isAnacrusis && analyzedMeasures.length > 0) {
    markAnacrusisNotesInMeasures(analyzedMeasures[0], anacrusisInfo)
  }
  
  // Identify LOCKED notes (包含方整性终止音标记)
  identifyLockedNotes(analyzedMeasures, metadata.timeSignature, squareStructure)
  
  // 🆕 乐句边界检测（增强版）
  const boundaryConfig = getDefaultBoundaryConfig(squareStructure)
  const phraseBoundaries = detectPhraseBoundariesEnhanced(
    allNotes, 
    squareStructure, 
    null, // embeddings - 如果有MusicVAE可以传入
    { ...boundaryConfig, totalMeasures: measures.length }
  )
  
  // 🆕 标记乐句终止音为LOCKED
  markPhraseEndingsInMeasures(analyzedMeasures, phraseBoundaries, squareStructure)
  
  // Identify voices for grand staff
  let voices = {}
  if (scoreType === 'grand-staff') {
    voices = await identifyVoices(allNotes)
  }
  
  // Get locked notes list
  const lockedNotes = analyzedMeasures.flatMap(m => m.notes).filter(n => n.isLocked)
  
  return {
    metadata,
    measures: analyzedMeasures,
    voices,
    lockedNotes,
    strongBeats,
    scoreType,
    // 🆕 新增分析结果
    anacrusisInfo,
    squareStructure,
    phraseBoundaries
  }
}

/**
 * 标记弱起小节中的音符为LOCKED
 * @param {Object} firstMeasure - 第一个小节
 * @param {Object} anacrusisInfo - 弱起检测结果
 */
function markAnacrusisNotesInMeasures(firstMeasure, anacrusisInfo) {
  if (!anacrusisInfo.isAnacrusis || !firstMeasure.notes) return
  
  firstMeasure.notes.forEach(note => {
    note.isLocked = true
    note.lockReason = 'anacrusis_note'
    note.lockPriority = 0 // 最高优先级
  })
}

/**
 * 标记乐句终止音为LOCKED
 * @param {Array} measures - 小节数组
 * @param {Array} phraseBoundaries - 乐句边界
 * @param {Object} squareStructure - 方整性结构
 */
function markPhraseEndingsInMeasures(measures, phraseBoundaries, squareStructure) {
  if (!phraseBoundaries || phraseBoundaries.length === 0) return
  
  // 根据方整性结构标记终止音
  if (squareStructure.isSquare && squareStructure.phraseEnds) {
    squareStructure.phraseEnds.forEach(endMeasure => {
      const measure = measures.find(m => m.number === endMeasure)
      if (measure && measure.notes && measure.notes.length > 0) {
        // 找到该小节的最后一个音符
        const lastNote = measure.notes[measure.notes.length - 1]
        if (lastNote && !lastNote.isLocked) {
          lastNote.isLocked = true
          lastNote.lockReason = 'square_phrase_cadence'
          lastNote.lockPriority = 2
          lastNote.isPhraseEnd = true
        }
      }
    })
  }
  
  // 根据检测到的边界标记
  phraseBoundaries.forEach(boundary => {
    if (boundary.phraseEnd) {
      const measure = measures.find(m => m.number === boundary.phraseEnd)
      if (measure && measure.notes && measure.notes.length > 0) {
        const lastNote = measure.notes[measure.notes.length - 1]
        if (lastNote && !lastNote.isLocked) {
          lastNote.isLocked = true
          lastNote.lockReason = boundary.source === 'square_rule' 
            ? 'square_phrase_cadence' 
            : 'phrase_cadence'
          lastNote.lockPriority = boundary.source === 'square_rule' ? 2 : 3
          lastNote.isPhraseEnd = true
        }
      }
    }
  })
}

/**
 * Identify LOCKED notes that should not be modified
 * 
 * 🆕 更新版：增加方整性终止音标记
 * 
 * LOCKED优先级（从高到低）：
 * 0. anacrusis_note - 弱起小节音符（最高优先级，在此函数之前已标记）
 * 1. syncopation - 切分音
 * 1. tie_across_beat - 跨拍Tie
 * 2. square_phrase_cadence - 方整结构终止音
 * 2. dotted_rhythm - 附点节奏
 * 2. melodic_turning_point - 旋律转折点
 * 3. phrase_cadence - 乐句终止音
 * 
 * @param {Array} measures - Array of measures
 * @param {Object} timeSignature - Time signature
 * @param {Object} squareStructure - 方整性结构分析结果
 */
function identifyLockedNotes(measures, timeSignature, squareStructure = null) {
  const strongBeats = getStrongBeats(timeSignature)
  
  measures.forEach((measure, measureIdx) => {
    // 按声部分组处理，确保旋律线的转折点正确识别
    const staff1Notes = measure.notes.filter(n => n.staff === 1)
    const staff2Notes = measure.notes.filter(n => n.staff === 2)
    
    measure.notes.forEach((note, noteIdx) => {
      // 🆕 跳过已被标记为弱起音符的（优先级0）
      if (note.isLocked && note.lockReason === 'anacrusis_note') {
        return
      }
      
      // Skip embellishments - they should be removed, not locked
      if (note.embellishment) return
      
      // Check for syncopation: starts on weak beat, extends to strong beat
      const startBeat = note.startBeat
      const durationBeats = note.duration.ticks / 1024
      const endBeat = startBeat + durationBeats
      
      const startsOnWeakBeat = !isStrongBeat(startBeat, timeSignature)
      const extendsToStrongBeat = strongBeats.some(sb => startBeat < sb && endBeat >= sb)
      
      if (startsOnWeakBeat && extendsToStrongBeat) {
        note.isLocked = true
        note.lockReason = 'syncopation'
        note.lockPriority = 1
        return
      }
      
      // Check for ties (cross-beat or cross-measure) - 优先级1
      if (note.tiedTo) {
        note.isLocked = true
        note.lockReason = 'tie_across_beat'
        note.lockPriority = 1
        return
      }
      
      // 🆕 Check for square structure phrase cadence - 优先级2
      if (squareStructure && squareStructure.isSquare && squareStructure.phraseEnds) {
        const measureNumber = measure.number || measureIdx + 1
        if (squareStructure.phraseEnds.includes(measureNumber)) {
          // 检查是否是该小节的最后一个音符
          const isLastInMeasure = noteIdx === measure.notes.length - 1
          if (isLastInMeasure && !note.isLocked) {
            note.isLocked = true
            note.lockReason = 'square_phrase_cadence'
            note.lockPriority = 2
            note.isPhraseEnd = true
            return
          }
        }
      }
      
      // Check for dotted rhythm (duration >= eighth note) - 优先级2
      if (note.duration.dots > 0 && note.duration.ticks >= 512) {
        note.isLocked = true
        note.lockReason = 'dotted_rhythm'
        note.lockPriority = 2
        return
      }
      
      // Check for off-beat start (back half of beat) - important for syncopation
      const beatFraction = startBeat % 1
      if (beatFraction >= 0.5 && beatFraction < 1) {
        // Only lock if duration extends past the beat
        if (durationBeats >= 0.5) {
          note.isLocked = true
          note.lockReason = 'off_beat_start'
          note.lockPriority = 2
          return
        }
      }
      
      // Check for triplet notes - preserve triplet structure
      if (note.duration.tuplet) {
        // Lock the first note of each triplet group
        const tupletRatio = note.duration.tuplet.actual / note.duration.tuplet.normal
        const isFirstOfTriplet = Math.abs(startBeat % (1 / tupletRatio) - 0) < 0.01
        if (isFirstOfTriplet) {
          note.isLocked = true
          note.lockReason = 'triplet_head'
          note.lockPriority = 2
          return
        }
      }
      
      // Check for melodic turning points (within same staff) - 优先级2
      const sameStaffNotes = note.staff === 1 ? staff1Notes : staff2Notes
      const staffNoteIdx = sameStaffNotes.findIndex(n => n.id === note.id)
      if (staffNoteIdx >= 0 && isMelodicTurningPoint(sameStaffNotes, staffNoteIdx)) {
        note.isLocked = true
        note.lockReason = 'melodic_turning_point'
        note.lockPriority = 2
        return
      }
      
      // Check for phrase endings (last note of measure with longer duration) - 优先级3
      if (noteIdx === measure.notes.length - 1 && note.duration.ticks >= 1024) {
        if (!note.isLocked) {
          note.isLocked = true
          note.lockReason = 'phrase_cadence'
          note.lockPriority = 3
          note.isPhraseEnd = true
        }
      }
    })
  })
}


/**
 * Check if a note is a melodic turning point
 * @param {Array} notes - Notes in measure
 * @param {number} index - Note index
 * @returns {boolean}
 */
function isMelodicTurningPoint(notes, index) {
  if (index === 0 || index === notes.length - 1) return false
  
  const prev = notes[index - 1]
  const curr = notes[index]
  const next = notes[index + 1]
  
  // Skip if any note is an embellishment
  if (prev.embellishment || curr.embellishment || next.embellishment) return false
  
  const prevMidi = pitchToMidi(prev.pitch)
  const currMidi = pitchToMidi(curr.pitch)
  const nextMidi = pitchToMidi(next.pitch)
  
  // Local maximum or minimum
  const isLocalMax = currMidi > prevMidi && currMidi > nextMidi
  const isLocalMin = currMidi < prevMidi && currMidi < nextMidi
  
  return isLocalMax || isLocalMin
}

/**
 * Identify SATB voices for grand staff
 * @param {Array} notes - All notes
 * @returns {Promise<Object>} Voice identification result
 */
async function identifyVoices(notes) {
  const voices = {
    soprano: [],
    alto: [],
    tenor: [],
    bass: []
  }
  
  // Separate by staff first
  const upperStaff = notes.filter(n => n.staff === 1)
  const lowerStaff = notes.filter(n => n.staff === 2)
  
  // Use AI if available, otherwise use rule-based
  if (isAIAvailable()) {
    voices.soprano = await identifyMelodyLine(upperStaff)
    voices.bass = identifyBassLine(lowerStaff)
  } else {
    // Rule-based: highest in upper staff is soprano
    voices.soprano = getHighestVoice(upperStaff)
    voices.bass = getLowestVoice(lowerStaff)
  }
  
  // Alto: remaining upper staff notes
  const sopranoIds = new Set(voices.soprano.map(n => n.id))
  voices.alto = upperStaff.filter(n => !sopranoIds.has(n.id))
  
  // Tenor: remaining lower staff notes
  const bassIds = new Set(voices.bass.map(n => n.id))
  voices.tenor = lowerStaff.filter(n => !bassIds.has(n.id))
  
  // Assign voice parts to notes
  voices.soprano.forEach(n => n.voicePart = 'soprano')
  voices.alto.forEach(n => n.voicePart = 'alto')
  voices.tenor.forEach(n => n.voicePart = 'tenor')
  voices.bass.forEach(n => n.voicePart = 'bass')
  
  return voices
}

/**
 * Get highest voice from notes (rule-based)
 * @param {Array} notes - Notes array
 * @returns {Array} Highest notes per beat
 */
function getHighestVoice(notes) {
  const beatGroups = groupByBeat(notes)
  const result = []
  
  beatGroups.forEach(group => {
    const highest = group.reduce((max, note) => {
      const maxMidi = pitchToMidi(max.pitch)
      const noteMidi = pitchToMidi(note.pitch)
      return noteMidi > maxMidi ? note : max
    })
    result.push(highest)
  })
  
  return result
}

/**
 * Get lowest voice from notes (rule-based)
 * @param {Array} notes - Notes array
 * @returns {Array} Lowest notes per beat
 */
function getLowestVoice(notes) {
  const beatGroups = groupByBeat(notes)
  const result = []
  
  beatGroups.forEach(group => {
    const lowest = group.reduce((min, note) => {
      const minMidi = pitchToMidi(min.pitch)
      const noteMidi = pitchToMidi(note.pitch)
      return noteMidi < minMidi ? note : min
    })
    result.push(lowest)
  })
  
  return result
}

/**
 * Group notes by beat position
 * @param {Array} notes - Notes array
 * @returns {Map} Map of beat -> notes
 */
function groupByBeat(notes) {
  const groups = new Map()
  
  notes.forEach(note => {
    const beat = Math.floor(note.startBeat)
    if (!groups.has(beat)) {
      groups.set(beat, [])
    }
    groups.get(beat).push(note)
  })
  
  return groups
}

/**
 * Detect anacrusis (pickup measure)
 * 
 * 🆕 更新版：使用新的 anacrusis-detector 模块
 * 保留此函数以保持向后兼容性
 * 
 * @param {Object} measure - First measure
 * @param {Object} timeSignature - Time signature
 * @returns {boolean}
 * @deprecated 请使用 detectAnacrusis 函数获取更详细的弱起信息
 */
export function isAnacrusis(measure, timeSignature) {
  // 使用新模块的检测函数
  const result = detectAnacrusis([measure], timeSignature)
  return result.isAnacrusis
}

/**
 * Identify rhythm pattern for a note
 * 根据 ProjectBlueprint_MSS3.md 规范识别节奏型
 * @param {Object} note - Note object
 * @param {Object} timeSignature - Time signature
 * @param {Array} contextNotes - Surrounding notes for context
 * @returns {string} Rhythm pattern type
 */
export function identifyRhythmPattern(note, timeSignature, contextNotes = []) {
  const startBeat = note.startBeat
  const durationBeats = note.duration.ticks / 1024
  const endBeat = startBeat + durationBeats
  const strongBeats = getStrongBeats(timeSignature)
  
  // Check for syncopation
  const startsOnWeakBeat = !isStrongBeat(startBeat, timeSignature)
  const extendsToStrongBeat = strongBeats.some(sb => startBeat < sb && endBeat >= sb)
  if (startsOnWeakBeat && extendsToStrongBeat) {
    return 'syncopation'
  }
  
  // Check for dotted rhythm
  if (note.duration.dots > 0) {
    if (note.duration.type === 'quarter') return 'dotted_quarter'
    if (note.duration.type === 'eighth') return 'dotted_eighth'
    if (note.duration.dots >= 2) return 'double_dotted'
    return 'dotted'
  }
  
  // Check for triplet
  if (note.duration.tuplet) {
    return 'triplet'
  }
  
  // Check for tied rhythm
  if (note.tiedTo) {
    return 'tied'
  }
  
  // Check for off-beat start (back half of beat)
  const beatFraction = startBeat % 1
  if (beatFraction >= 0.5 && beatFraction < 1) {
    return 'off_beat'
  }
  
  // Check for beat-head pattern
  if (Math.abs(beatFraction) < 0.1) {
    return 'beat_head'
  }
  
  return 'isorhythmic'
}

/**
 * Analyze rhythm patterns in a measure
 * @param {Object} measure - Measure object
 * @param {Object} timeSignature - Time signature
 * @returns {Object} Rhythm analysis result
 */
export function analyzeRhythmPatterns(measure, timeSignature) {
  const patterns = {}
  
  measure.notes.forEach(note => {
    if (note.embellishment) return
    
    const pattern = identifyRhythmPattern(note, timeSignature, measure.notes)
    patterns[pattern] = (patterns[pattern] || 0) + 1
    
    // Assign pattern to note
    note.rhythmPattern = pattern
    
    // Check if this pattern should be LOCKED
    const patternDef = RHYTHM_PATTERNS[pattern]
    if (patternDef && patternDef.locked && !note.isLocked) {
      note.isLocked = true
      note.lockReason = pattern
    }
  })
  
  return patterns
}
