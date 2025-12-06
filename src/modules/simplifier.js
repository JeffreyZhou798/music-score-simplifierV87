/**
 * Simplification Engine
 * Orchestrates the simplification process
 * 
 * 支持两种模式：
 * 1. 同步模式（simplifyScore）- 使用规则引擎
 * 2. 异步模式（simplifyScoreAsync）- 使用AI增强的声部分离
 * 
 * 🆕 更新版：增强弱起小节保护机制
 * - 弱起小节根据Level采用不同保护策略
 * - 方整性结构影响简化决策
 */

import { applySingleStaffSimplification } from '../rules/singleStaff.js'
import { applyGrandStaffSimplification, applyGrandStaffSimplificationAsync } from '../rules/grandStaff.js'
import { detectAnacrusis, getAnacrusisProtectionStrategy } from './anacrusis-detector.js'

/**
 * Simplify an analyzed score (同步版本，使用规则引擎)
 * 
 * 🆕 更新版：增强弱起小节保护
 * 
 * @param {Object} analyzedScore - Analyzed score from analyzer
 * @param {Object} config - Simplification configuration
 * @returns {Object} Simplified score
 */
export function simplifyScore(analyzedScore, config) {
  const { metadata, measures, scoreType, anacrusisInfo, squareStructure } = analyzedScore
  const { mainLevel, sopranoLevel, bassLevel } = config
  
  // 🆕 使用分析阶段的弱起检测结果，或重新检测
  const anacrusis = anacrusisInfo || detectAnacrusis(measures, metadata.timeSignature)
  const hasAnacrusis = anacrusis.isAnacrusis
  
  // 🆕 获取弱起保护策略
  const anacrusisStrategy = getAnacrusisProtectionStrategy(mainLevel)
  
  const simplifiedMeasures = measures.map((measure, index) => {
    // 🆕 弱起小节处理（根据Level采用不同策略）
    if (hasAnacrusis && index === 0) {
      return preserveAnacrusisWithStrategy(measure, mainLevel, anacrusisStrategy, metadata.timeSignature, scoreType, config)
    }
    
    if (scoreType === 'single-staff') {
      return applySingleStaffSimplification(measure, mainLevel, metadata.timeSignature)
    } else {
      return applyGrandStaffSimplification(measure, mainLevel, metadata.timeSignature, {
        sopranoLevel: sopranoLevel || getDefaultSopranoLevel(mainLevel),
        bassLevel: bassLevel || getDefaultBassLevel(mainLevel)
      })
    }
  })
  
  return {
    metadata,
    measures: simplifiedMeasures,
    simplificationLevel: mainLevel,
    scoreType,
    // 🆕 保留分析信息
    anacrusisInfo: anacrusis,
    squareStructure
  }
}

/**
 * Simplify an analyzed score (异步版本，支持AI声部分离)
 * 
 * 使用三层决策架构进行声部分离：
 * 1. 规则引擎（快速筛选）
 * 2. MusicVAE + KNN（智能归属）
 * 3. K-means 验证（质量检查）
 * 
 * 🆕 更新版：增强弱起小节保护
 * 
 * @param {Object} analyzedScore - Analyzed score from analyzer
 * @param {Object} config - Simplification configuration
 * @param {Function} onProgress - Progress callback (optional)
 * @returns {Promise<Object>} Simplified score
 */
export async function simplifyScoreAsync(analyzedScore, config, onProgress = null) {
  const { metadata, measures, scoreType, anacrusisInfo, squareStructure } = analyzedScore
  const { mainLevel, sopranoLevel, bassLevel } = config
  
  // 🆕 使用分析阶段的弱起检测结果，或重新检测
  const anacrusis = anacrusisInfo || detectAnacrusis(measures, metadata.timeSignature)
  const hasAnacrusis = anacrusis.isAnacrusis
  
  // 🆕 获取弱起保护策略
  const anacrusisStrategy = getAnacrusisProtectionStrategy(mainLevel)
  
  const simplifiedMeasures = []
  const totalMeasures = measures.length
  
  for (let index = 0; index < measures.length; index++) {
    const measure = measures[index]
    
    // Report progress
    if (onProgress) {
      onProgress(Math.round((index / totalMeasures) * 100))
    }
    
    // 🆕 弱起小节处理（根据Level采用不同策略）
    if (hasAnacrusis && index === 0) {
      simplifiedMeasures.push(
        preserveAnacrusisWithStrategy(measure, mainLevel, anacrusisStrategy, metadata.timeSignature, scoreType, config)
      )
      continue
    }
    
    if (scoreType === 'single-staff') {
      simplifiedMeasures.push(
        applySingleStaffSimplification(measure, mainLevel, metadata.timeSignature)
      )
    } else {
      // 使用AI增强的异步声部分离
      const simplified = await applyGrandStaffSimplificationAsync(
        measure, 
        mainLevel, 
        metadata.timeSignature, 
        {
          sopranoLevel: sopranoLevel || getDefaultSopranoLevel(mainLevel),
          bassLevel: bassLevel || getDefaultBassLevel(mainLevel)
        }
      )
      simplifiedMeasures.push(simplified)
    }
  }
  
  if (onProgress) {
    onProgress(100)
  }
  
  return {
    metadata,
    measures: simplifiedMeasures,
    simplificationLevel: mainLevel,
    scoreType,
    // 🆕 保留分析信息
    anacrusisInfo: anacrusis,
    squareStructure
  }
}

/**
 * Preserve anacrusis measure (legacy function)
 * @param {Object} measure - Anacrusis measure
 * @returns {Object} Preserved measure
 */
function preserveAnacrusis(measure) {
  // Remove embellishments but preserve structure
  const notes = measure.notes.filter(n => !n.embellishment)
  return { ...measure, notes }
}

/**
 * 🆕 根据Level策略保护弱起小节
 * 
 * 弱起处理策略：
 * - Level 1: 保留弱起小节第一个音符，时值保持不变（不扩展为全小节）
 * - Level 2-3: 保留弱起小节所有音符，不做简化
 * - Level 4-5: 完全保留弱起小节原貌，保护节奏型
 * 
 * @param {Object} measure - 弱起小节
 * @param {number} level - 简化级别
 * @param {Object} strategy - 保护策略
 * @param {Object} timeSignature - 拍号
 * @param {string} scoreType - 谱表类型
 * @param {Object} config - 配置
 * @returns {Object} 处理后的小节
 */
function preserveAnacrusisWithStrategy(measure, level, strategy, timeSignature, scoreType, config) {
  // 过滤装饰音
  const mainNotes = measure.notes.filter(n => !n.embellishment)
  
  if (mainNotes.length === 0) {
    return { ...measure, notes: [] }
  }
  
  // Level 1: 只保留第一个音符，但不扩展时值
  if (level === 1 && strategy.keepFirstNoteOnly) {
    const sortedNotes = [...mainNotes].sort((a, b) => a.startBeat - b.startBeat)
    const firstNote = sortedNotes[0]
    
    // 保持原始时值，不扩展
    return {
      ...measure,
      notes: [{
        ...firstNote,
        isLocked: true,
        lockReason: 'anacrusis_note',
        lockPriority: 0
      }],
      rests: []
    }
  }
  
  // Level 2-5: 保留所有音符
  if (strategy.keepAllNotes) {
    const preservedNotes = mainNotes.map(note => ({
      ...note,
      isLocked: true,
      lockReason: 'anacrusis_note',
      lockPriority: 0
    }))
    
    return {
      ...measure,
      notes: preservedNotes,
      rests: measure.rests || []
    }
  }
  
  // 默认：移除装饰音，保留其他
  return {
    ...measure,
    notes: mainNotes.map(note => ({
      ...note,
      isLocked: true,
      lockReason: 'anacrusis_note',
      lockPriority: 0
    }))
  }
}

/**
 * Get default soprano level for grand staff
 * @param {number} mainLevel - Main simplification level
 * @returns {number} Default soprano level
 */
function getDefaultSopranoLevel(mainLevel) {
  const defaults = { 1: 4, 2: 4, 3: 5, 4: 4, 5: 5 }
  return defaults[mainLevel] || 4
}

/**
 * Get default bass level for grand staff
 * @param {number} mainLevel - Main simplification level
 * @returns {number} Default bass level
 */
function getDefaultBassLevel(mainLevel) {
  const defaults = { 1: 1, 2: 2, 3: 2, 4: 2, 5: 5 }
  return defaults[mainLevel] || 2
}

/**
 * Get level description for UI
 * @param {number} level - Level number
 * @param {string} scoreType - Score type
 * @returns {Object} Level description
 */
export function getLevelDescription(level, scoreType) {
  if (scoreType === 'single-staff') {
    return SINGLE_STAFF_DESCRIPTIONS[level]
  }
  return GRAND_STAFF_DESCRIPTIONS[level]
}

const SINGLE_STAFF_DESCRIPTIONS = {
  1: {
    title: 'Level 1 - Skeleton',
    description: 'Keeps only the first note of each measure, extended to fill the entire measure. Simplest version for absolute beginners.'
  },
  2: {
    title: 'Level 2 - Strong Beats',
    description: 'Keeps notes on strong beat positions only. Each note extends to cover weak beats until the next strong beat.'
  },
  3: {
    title: 'Level 3 - Beat Heads',
    description: 'Keeps the first note of each beat (beat-head notes). Removes subdivisions within beats while preserving the basic pulse.'
  },
  4: {
    title: 'Level 4 - Rhythmic Core',
    description: 'Preserves quarter and eighth notes. Converts shorter notes to eighths. Maintains syncopation, dotted rhythms, and tied notes.'
  },
  5: {
    title: 'Level 5 - Near Original',
    description: 'Removes ornaments (grace notes, trills, turns) only. All other musical elements preserved as in the original score.'
  }
}

const GRAND_STAFF_DESCRIPTIONS = {
  1: {
    title: 'Level 1 - Two-Voice Skeleton',
    description: 'Right hand: Soprano melody (customizable L1-5). Left hand: Bass note per measure (customizable L1-5). Two-part harmony for beginners.'
  },
  2: {
    title: 'Level 2 - Three-Voice (RH Enhanced)',
    description: 'Right hand: Soprano (customizable L2-5) + Alto on strong beats. Left hand: Bass on strong beats (customizable L2-5). Three-part harmony.'
  },
  3: {
    title: 'Level 3 - Three-Voice (LH Enhanced)',
    description: 'Right hand: Soprano only (customizable L2-5). Left hand: Tenor + Bass on strong beats (customizable L2-5). Three-part harmony with fuller bass.'
  },
  4: {
    title: 'Level 4 - Four-Voice Harmony',
    description: 'Right hand: Soprano (customizable L2-5) + Alto (L4). Left hand: Tenor (L4) + Bass (customizable L2-5). Full SATB with rhythmic simplification.'
  },
  5: {
    title: 'Level 5 - Near Original',
    description: 'Right hand: Soprano (customizable L4-5) + Alto (L5). Left hand: Tenor (L5) + Bass (customizable L4-5). Ornaments removed, all else preserved.'
  }
}
