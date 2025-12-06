/**
 * Anacrusis (Pickup Measure) Detector Module
 * 弱起小节检测模块
 * 
 * 根据 MSS模型组合架构方案1-1.md 规范：
 * - 检测首小节时长是否小于标准小节时长
 * - 统计弱起音符数量
 * - 计算起始拍位
 * - 检测尾小节是否与首小节互补
 */

/**
 * 检测弱起小节
 * @param {Array} measures - 所有小节数组
 * @param {Object} timeSignature - 拍号 { beats, beatType }
 * @param {number} divisions - 每四分音符的分割数（默认1024 ticks）
 * @returns {Object} 弱起小节检测结果
 */
export function detectAnacrusis(measures, timeSignature, divisions = 1024) {
  if (!measures || measures.length === 0) {
    return { isAnacrusis: false }
  }

  const firstMeasure = measures[0]
  const lastMeasure = measures[measures.length - 1]
  
  // 计算完整小节的标准时长（以 ticks 为单位）
  // 例如：4/4拍 = 4 * 1024 = 4096 ticks
  const fullMeasureDuration = timeSignature.beats * divisions

  // 计算首小节的实际时长
  const firstMeasureDuration = calculateMeasureDuration(firstMeasure, divisions)
  
  // 如果首小节时长小于标准时长的90%，认为是弱起小节
  if (firstMeasureDuration >= fullMeasureDuration * 0.9) {
    return { isAnacrusis: false }
  }

  // 收集弱起小节的所有音符
  const pickupNotes = firstMeasure.notes || []
  
  // 计算起始拍位（第一个音符相对于小节的位置）
  const startBeat = pickupNotes.length > 0 
    ? calculateStartBeat(pickupNotes[0], timeSignature, fullMeasureDuration, firstMeasureDuration)
    : 1

  // 检测尾小节是否与首小节互补
  const lastMeasureDuration = calculateMeasureDuration(lastMeasure, divisions)
  const hasCompensation = Math.abs(
    firstMeasureDuration + lastMeasureDuration - fullMeasureDuration
  ) < divisions * 0.1 // 允许10%误差

  return {
    isAnacrusis: true,
    pickupDuration: firstMeasureDuration,
    fullMeasureDuration: fullMeasureDuration,
    pickupNoteCount: pickupNotes.length,
    pickupNotes: pickupNotes,
    startBeat: startBeat,
    hasCompensation: hasCompensation,
    compensationDuration: hasCompensation ? lastMeasureDuration : 0
  }
}

/**
 * 计算小节的实际时长
 * @param {Object} measure - 小节对象
 * @param {number} divisions - 每四分音符的分割数
 * @returns {number} 小节时长（ticks）
 */
function calculateMeasureDuration(measure, divisions) {
  if (!measure || !measure.notes || measure.notes.length === 0) {
    // 如果只有休止符，计算休止符时长
    if (measure && measure.rests && measure.rests.length > 0) {
      return measure.rests.reduce((sum, rest) => {
        return sum + (rest.duration?.ticks || 0)
      }, 0)
    }
    return 0
  }

  // 按声部分组计算时值（因为多声部同时发声）
  const voiceGroups = new Map()
  
  measure.notes.forEach(note => {
    const voiceKey = `${note.staff || 1}_${note.voice || 1}`
    if (!voiceGroups.has(voiceKey)) {
      voiceGroups.set(voiceKey, [])
    }
    voiceGroups.get(voiceKey).push(note)
  })

  // 计算每个声部的实际时值，取最大值
  let maxDuration = 0
  
  voiceGroups.forEach(notes => {
    // 找到该声部的最后一个音符的结束位置
    let maxEndPosition = 0
    
    notes.forEach(note => {
      // startBeat 从 1 开始，转换为从 0 开始的位置
      const startPosition = (note.startBeat - 1) * divisions
      const noteDuration = note.duration?.ticks || 0
      const endPosition = startPosition + noteDuration
      
      if (endPosition > maxEndPosition) {
        maxEndPosition = endPosition
      }
    })
    
    if (maxEndPosition > maxDuration) {
      maxDuration = maxEndPosition
    }
  })

  return maxDuration
}

/**
 * 计算首音符的起始拍位
 * @param {Object} firstNote - 首个音符
 * @param {Object} timeSignature - 拍号
 * @param {number} fullMeasureDuration - 完整小节时长
 * @param {number} pickupDuration - 弱起小节时长
 * @returns {number} 起始拍位（如 3.5 表示第4拍后半）
 */
function calculateStartBeat(firstNote, timeSignature, fullMeasureDuration, pickupDuration) {
  // 弱起小节的音符实际上是从完整小节的某个位置开始
  // 例如：4/4拍的弱起小节只有1拍，那么起始位置是第4拍
  const missingDuration = fullMeasureDuration - pickupDuration
  const startBeat = (missingDuration / 1024) + 1 // 转换为拍数（1-indexed）
  
  return startBeat
}

/**
 * 标记弱起小节的所有音符为 LOCKED
 * @param {Array} notes - 音符数组
 * @param {Object} anacrusisInfo - 弱起检测结果
 * @returns {Array} 标记后的音符数组
 */
export function markAnacrusisNotesAsLocked(notes, anacrusisInfo) {
  if (!anacrusisInfo.isAnacrusis || !notes) {
    return notes
  }

  return notes.map(note => {
    // 检查音符是否属于弱起小节（measureNumber === 1）
    if (note.measureNumber === 1 || note.measureNumber === undefined) {
      // 检查是否在弱起音符列表中
      const isPickupNote = anacrusisInfo.pickupNotes?.some(pn => pn.id === note.id)
      
      if (isPickupNote || note.measureNumber === 1) {
        return {
          ...note,
          isLocked: true,
          lockReason: 'anacrusis_note',
          lockPriority: 0 // 最高优先级
        }
      }
    }
    return note
  })
}

/**
 * 检查音符是否属于弱起小节
 * @param {Object} note - 音符对象
 * @param {Object} anacrusisInfo - 弱起检测结果
 * @returns {boolean}
 */
export function isAnacrusisNote(note, anacrusisInfo) {
  if (!anacrusisInfo.isAnacrusis) {
    return false
  }
  
  // measureNumber === 1 且是弱起小节
  return note.measureNumber === 1
}

/**
 * 获取弱起小节的保护策略
 * @param {number} level - 简化级别 (1-5)
 * @returns {Object} 保护策略
 */
export function getAnacrusisProtectionStrategy(level) {
  const strategies = {
    1: {
      // Level 1: 保留弱起小节第一个音符，时值保持不变（不扩展为全小节）
      keepFirstNoteOnly: true,
      extendDuration: false,
      description: '保留弱起小节第一音，不扩展时值'
    },
    2: {
      // Level 2-3: 保留弱起小节所有音符，不做简化
      keepAllNotes: true,
      simplify: false,
      description: '完全保留弱起小节，不简化'
    },
    3: {
      keepAllNotes: true,
      simplify: false,
      description: '完全保留弱起小节，不简化'
    },
    4: {
      // Level 4-5: 完全保留弱起小节原貌，保护节奏型
      keepAllNotes: true,
      preserveRhythm: true,
      markAllLocked: true,
      description: '弱起小节所有音符标记LOCKED'
    },
    5: {
      keepAllNotes: true,
      preserveRhythm: true,
      preserveOriginal: true,
      description: '完全保留弱起小节原貌'
    }
  }

  return strategies[level] || strategies[5]
}

export default {
  detectAnacrusis,
  markAnacrusisNotesAsLocked,
  isAnacrusisNote,
  getAnacrusisProtectionStrategy
}
