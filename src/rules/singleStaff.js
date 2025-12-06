import { getStrongBeats } from '../knowledge/index.js'

/**
 * Level 1: 骨架简化
 * 
 * 🆕 更新版：
 * - 每小节保留第一个音符
 * - 时值扩展为整小节长度
 * - 弱起小节的音符保持原位（不移动到第1拍）
 * - LOCKED音符保持原样
 */
export function applyLevel1(measure, timeSignature) {
  const notes = measure.notes.filter(n => !n.embellishment)
  if (notes.length === 0) return { ...measure, notes: [] }
  
  const sortedNotes = [...notes].sort((a, b) => a.startBeat - b.startBeat)
  const firstNote = sortedNotes[0]
  const measureDuration = timeSignature.beats * 1024
  
  // 🆕 检查是否是弱起音符（已被标记为LOCKED且lockReason为anacrusis_note）
  const isAnacrusisNote = firstNote.isLocked && firstNote.lockReason === 'anacrusis_note'
  
  if (isAnacrusisNote) {
    // 弱起音符：保持原位和原时值
    return {
      ...measure,
      notes: [{ ...firstNote }],
      rests: []
    }
  }
  
  // 普通小节：移动到第1拍，扩展时值
  return {
    ...measure,
    notes: [{
      ...firstNote,
      startBeat: 1,
      duration: { type: getDurationTypeFromTicks(measureDuration), ticks: measureDuration, dots: 0 }
    }],
    rests: []
  }
}

/**
 * Level 2: 强拍简化
 * 
 * 🆕 更新版（方整性结构保护 + 弱起保护）：
 * 1. 弱起小节的所有音符完全保留（不做任何简化）
 * 2. LOCKED音符保持原样
 * 3. 其他音符移动到强拍位置
 * 4. 时值延长到下一个强拍
 * 5. 避免同一拍位出现多个音符（单旋律乐谱）
 */
export function applyLevel2(measure, timeSignature) {
  const notes = measure.notes.filter(n => !n.embellishment)
  if (notes.length === 0) return { ...measure, notes: [] }
  
  // 按起始拍位排序
  const sortedNotes = [...notes].sort((a, b) => a.startBeat - b.startBeat)
  
  // 🆕 检查是否有弱起音符（整个小节都是弱起）
  const hasAnacrusisNotes = sortedNotes.some(n => n.isLocked && n.lockReason === 'anacrusis_note')
  
  // 如果是弱起小节，完全保留所有音符
  if (hasAnacrusisNotes) {
    return { ...measure, notes: sortedNotes, rests: measure.rests || [] }
  }
  
  const strongBeats = getStrongBeats(timeSignature)
  const result = []
  const usedNotes = new Set()
  const usedBeats = new Set() // 🆕 记录已使用的拍位，避免重复
  
  // 首先保留所有LOCKED音符（保持原始位置和时值）
  sortedNotes.forEach(note => {
    if (note.isLocked) {
      result.push({ ...note })
      usedNotes.add(note.id)
      // 🆕 标记该拍位已被使用（四舍五入到1/4拍精度）
      const beatKey = Math.round(note.startBeat * 4) / 4
      usedBeats.add(beatKey)
    }
  })
  
  strongBeats.forEach((strongBeat, idx) => {
    // 🆕 如果该强拍位置已有LOCKED音符，跳过
    const beatKey = Math.round(strongBeat * 4) / 4
    if (usedBeats.has(beatKey)) return
    
    const noteAtBeat = findNoteAtBeatExcluding(sortedNotes, strongBeat, usedNotes)
    if (!noteAtBeat) return
    
    usedNotes.add(noteAtBeat.id)
    usedBeats.add(beatKey)
    
    const nextStrongBeat = strongBeats[idx + 1] || (timeSignature.beats + 1)
    const durationTicks = (nextStrongBeat - strongBeat) * 1024
    
    // 音符移动到强拍位置
    result.push({
      ...noteAtBeat,
      startBeat: strongBeat,
      duration: { type: getDurationTypeFromTicks(durationTicks), ticks: durationTicks, dots: 0 }
    })
  })
  
  // 按起始拍位排序结果
  result.sort((a, b) => a.startBeat - b.startBeat)
  
  return { ...measure, notes: result, rests: [] }
}

/**
 * Level 3: 拍头简化
 * 
 * 🆕 更新版：
 * - 弱起小节完全保留，不做简化
 * - LOCKED音符保持原样
 * - 每拍保留拍头音符
 * - 避免同一拍位出现多个音符
 */
export function applyLevel3(measure, timeSignature) {
  const notes = measure.notes.filter(n => !n.embellishment)
  if (notes.length === 0) return { ...measure, notes: [] }
  
  // 🆕 检查是否有弱起音符
  const hasAnacrusisNotes = notes.some(n => n.isLocked && n.lockReason === 'anacrusis_note')
  
  // 如果是弱起小节，完全保留所有音符
  if (hasAnacrusisNotes) {
    return { ...measure, notes: notes, rests: measure.rests || [] }
  }
  
  const result = []
  const usedNotes = new Set()
  const usedBeats = new Set() // 🆕 记录已使用的拍位
  
  // 🆕 首先保留所有LOCKED音符
  notes.forEach(note => {
    if (note.isLocked) {
      result.push({ ...note })
      usedNotes.add(note.id)
      // 标记该拍位已被使用
      const beatKey = Math.round(note.startBeat)
      usedBeats.add(beatKey)
    }
  })
  
  for (let beat = 1; beat <= timeSignature.beats; beat++) {
    // 🆕 如果该拍位已有LOCKED音符，跳过
    if (usedBeats.has(beat)) continue
    
    const noteAtBeat = findNoteAtBeat(notes.filter(n => !usedNotes.has(n.id)), beat)
    if (!noteAtBeat) continue
    
    usedNotes.add(noteAtBeat.id)
    usedBeats.add(beat)
    result.push({
      ...noteAtBeat,
      startBeat: beat,
      duration: { type: 'quarter', ticks: 1024, dots: 0 }
    })
  }
  
  // 按起始拍位排序
  result.sort((a, b) => a.startBeat - b.startBeat)
  
  return { ...measure, notes: result, rests: [] }
}


/**
 * Level 4: 节奏核心简化
 * 
 * 🆕 更新版：
 * - 弱起小节所有音符标记LOCKED，完全保留
 * - 保护切分/附点/Tie/转折点
 * - 移除装饰音
 * - 十六分→八分，三十二分→八分
 * - 避免同一拍位出现多个音符
 */
export function applyLevel4(measure, timeSignature) {
  const result = []
  const processedPositions = new Set()
  const usedBeats = new Set() // 🆕 记录已使用的拍位
  const sortedNotes = [...measure.notes].sort((a, b) => a.startBeat - b.startBeat)
  
  // 分离装饰音和主音
  const mainNotes = sortedNotes.filter(n => !n.embellishment)
  const embellishments = sortedNotes.filter(n => n.embellishment)
  
  // 🆕 检查是否有弱起音符
  const hasAnacrusisNotes = mainNotes.some(n => n.isLocked && n.lockReason === 'anacrusis_note')
  
  // 如果是弱起小节，完全保留所有音符（标记为LOCKED）
  if (hasAnacrusisNotes) {
    const preservedNotes = mainNotes.map(note => ({
      ...note,
      isLocked: true,
      lockReason: note.lockReason || 'anacrusis_note',
      lockPriority: note.lockPriority ?? 0
    }))
    return { ...measure, notes: preservedNotes, rests: measure.rests || [] }
  }
  
  // 将装饰音合并到最近的LOCKED主音（如果有）
  embellishments.forEach(emb => {
    const nearestLocked = mainNotes
      .filter(n => n.isLocked)
      .reduce((nearest, n) => {
        const dist = Math.abs(n.startBeat - emb.startBeat)
        if (!nearest || dist < nearest.dist) return { note: n, dist }
        return nearest
      }, null)
    // 装饰音不独立保留，仅标记已处理
  })
  
  mainNotes.forEach(note => {
    // 🆕 LOCKED音符完全保留（包括弱起、切分、附点、方整终止音等）
    if (note.isLocked) {
      const beatKey = Math.round(note.startBeat * 4) / 4
      // 🆕 检查该拍位是否已被使用
      if (!usedBeats.has(beatKey)) {
        result.push({ ...note })
        usedBeats.add(beatKey)
      }
      return
    }
    const ticks = note.duration.ticks
    if (ticks >= 512) {
      const beatKey = Math.round(note.startBeat * 4) / 4
      if (!usedBeats.has(beatKey)) {
        result.push({ ...note })
        usedBeats.add(beatKey)
      }
      return
    }
    if (note.duration.tuplet) {
      const { actual, normal } = note.duration.tuplet
      const tripletBeatUnit = 1 / actual
      const tripletPosition = Math.floor(note.startBeat / tripletBeatUnit) * tripletBeatUnit
      const posKey = 'triplet_' + tripletPosition.toFixed(3)
      const beatKey = Math.round(tripletPosition * 4) / 4
      if (!processedPositions.has(posKey) && !usedBeats.has(beatKey)) {
        processedPositions.add(posKey)
        usedBeats.add(beatKey)
        result.push({
          ...note,
          startBeat: tripletPosition,
          duration: { type: 'eighth', dots: 0, ticks: Math.round(512 * normal / actual), tuplet: { actual, normal } }
        })
      }
      return
    }
    const eighthBeatPosition = Math.floor(note.startBeat * 2) / 2
    const posKey = 'eighth_' + eighthBeatPosition.toFixed(2)
    const beatKey = Math.round(eighthBeatPosition * 4) / 4
    if (!processedPositions.has(posKey) && !usedBeats.has(beatKey)) {
      processedPositions.add(posKey)
      usedBeats.add(beatKey)
      result.push({
        ...note,
        startBeat: eighthBeatPosition,
        duration: { type: 'eighth', dots: 0, ticks: 512 }
      })
    }
  })
  
  // 处理休止符：短于八分休止符的统一延长为八分休止符
  const simplifiedRests = (measure.rests || []).map(rest => {
    if (rest.duration.ticks < 512) {
      return {
        ...rest,
        duration: { type: 'eighth', dots: 0, ticks: 512 }
      }
    }
    return rest
  })
  
  return { ...measure, notes: result, rests: simplifiedRests }
}

/**
 * Level 5: 近原谱简化
 * 
 * 🆕 更新版：
 * - 弱起小节完全保留原貌
 * - 仅移除装饰音（trill/turn/mordent等）
 * - 所有其他音乐元素保持原样
 */
export function applyLevel5(measure, timeSignature) {
  // Level 5: 移除装饰音，其他按原谱保留
  // 装饰音不得独立保留，可合并到最近的LOCKED主音
  const mainNotes = measure.notes.filter(n => !n.embellishment)
  const embellishments = measure.notes.filter(n => n.embellishment)
  
  // 🆕 检查是否有弱起音符
  const hasAnacrusisNotes = mainNotes.some(n => n.isLocked && n.lockReason === 'anacrusis_note')
  
  // 如果是弱起小节，完全保留原貌
  if (hasAnacrusisNotes) {
    return { ...measure, notes: mainNotes, rests: measure.rests || [] }
  }
  
  // 装饰音处理：找到最近的主音并标记（用于演奏提示，但不改变音符本身）
  embellishments.forEach(emb => {
    const nearestMain = mainNotes.reduce((nearest, n) => {
      const dist = Math.abs(n.startBeat - emb.startBeat)
      if (!nearest || dist < nearest.dist) return { note: n, dist }
      return nearest
    }, null)
    if (nearestMain && nearestMain.note) {
      // 可选：标记该主音曾有装饰音
      nearestMain.note.hadEmbellishment = emb.embellishment
    }
  })
  
  return { ...measure, notes: mainNotes, rests: measure.rests }
}

function findNoteAtBeat(notes, beat) {
  if (!notes || notes.length === 0) return null
  let note = notes.find(n => Math.abs(n.startBeat - beat) < 0.1)
  if (!note) {
    note = notes.find(n => {
      const endBeat = n.startBeat + (n.duration.ticks / 1024)
      return n.startBeat <= beat && endBeat > beat
    })
  }
  if (!note) {
    let minDistance = Infinity
    notes.forEach(n => {
      const distance = Math.abs(n.startBeat - beat)
      if (distance < minDistance) {
        minDistance = distance
        note = n
      }
    })
  }
  return note
}

/**
 * 查找指定拍位的音符，排除已使用的音符
 */
function findNoteAtBeatExcluding(notes, beat, usedNotes) {
  if (!notes || notes.length === 0) return null
  
  // 首先查找精确匹配
  let note = notes.find(n => !usedNotes.has(n.id) && Math.abs(n.startBeat - beat) < 0.1)
  
  // 查找覆盖该拍位的音符
  if (!note) {
    note = notes.find(n => {
      if (usedNotes.has(n.id)) return false
      const endBeat = n.startBeat + (n.duration.ticks / 1024)
      return n.startBeat <= beat && endBeat > beat
    })
  }
  
  // 查找最近的音符
  if (!note) {
    let minDistance = Infinity
    notes.forEach(n => {
      if (usedNotes.has(n.id)) return
      const distance = Math.abs(n.startBeat - beat)
      if (distance < minDistance && distance < 2) {
        minDistance = distance
        note = n
      }
    })
  }
  
  return note
}

function getDurationTypeFromTicks(ticks) {
  if (ticks >= 4096) return 'whole'
  if (ticks >= 2048) return 'half'
  if (ticks >= 1024) return 'quarter'
  if (ticks >= 512) return 'eighth'
  if (ticks >= 256) return 'sixteenth'
  return '32nd'
}

export function applySingleStaffSimplification(measure, level, timeSignature) {
  switch (level) {
    case 1: return applyLevel1(measure, timeSignature)
    case 2: return applyLevel2(measure, timeSignature)
    case 3: return applyLevel3(measure, timeSignature)
    case 4: return applyLevel4(measure, timeSignature)
    case 5: return applyLevel5(measure, timeSignature)
    default: return measure
  }
}
