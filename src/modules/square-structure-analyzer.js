/**
 * Square Structure Analyzer Module
 * 方整性结构分析模块
 * 
 * 根据 MSS模型组合架构方案1-1.md 规范：
 * - 分析乐句长度序列的规律性
 * - 检测偶数性、对称性、周期性
 * - 识别方整与非方整结构
 * - 影响乐句边界识别权重
 */

/**
 * 分析方整性结构
 * @param {Array} phrases - 乐句数组，每个乐句包含 { measureCount, startMeasure, endMeasure }
 * @returns {Object} 方整性分析结果
 */
export function analyzeSquareStructure(phrases) {
  if (!phrases || phrases.length === 0) {
    return {
      isSquare: false,
      confidence: 0,
      phraseLengths: [],
      pattern: 'unknown',
      characteristics: {
        allEven: false,
        symmetric: false,
        periodic: false
      }
    }
  }

  const phraseLengths = phrases.map(p => p.measureCount || p.length || 0)
  
  // 1. 检测偶数性：所有乐句长度是否为偶数
  const allEven = phraseLengths.every(len => len % 2 === 0)
  
  // 2. 检测对称性：前后乐句长度是否相等
  const isSymmetric = checkSymmetry(phraseLengths)
  
  // 3. 检测周期性：是否有重复模式
  const pattern = findRepeatingPattern(phraseLengths)
  
  // 4. 综合判定方整性
  const isSquare = allEven && (isSymmetric || pattern.isRegular)
  
  // 5. 计算置信度
  const confidence = calculateConfidence(allEven, isSymmetric, pattern)
  
  // 6. 计算乐句终止位置（用于LOCKED标记）
  const phraseEnds = calculatePhraseEnds(phrases)

  return {
    isSquare: isSquare,
    confidence: confidence,
    phraseLengths: phraseLengths,
    pattern: pattern.description,
    phraseEnds: phraseEnds,
    characteristics: {
      allEven: allEven,
      symmetric: isSymmetric,
      periodic: pattern.isRegular
    },
    // 方整性类型分类
    structureType: classifyStructureType(isSquare, allEven, isSymmetric, pattern, phraseLengths)
  }
}

/**
 * 检测对称性
 * @param {Array} phraseLengths - 乐句长度数组
 * @returns {boolean}
 */
function checkSymmetry(phraseLengths) {
  if (phraseLengths.length < 2) return false
  
  // 检查相邻乐句对是否长度相等
  let symmetricPairs = 0
  let totalPairs = 0
  
  for (let i = 0; i < phraseLengths.length - 1; i += 2) {
    if (i + 1 < phraseLengths.length) {
      totalPairs++
      if (phraseLengths[i] === phraseLengths[i + 1]) {
        symmetricPairs++
      }
    }
  }
  
  // 如果超过70%的乐句对是对称的，认为整体对称
  return totalPairs > 0 && (symmetricPairs / totalPairs) >= 0.7
}

/**
 * 查找重复模式
 * @param {Array} lengths - 乐句长度数组
 * @returns {Object} { isRegular, description }
 */
function findRepeatingPattern(lengths) {
  if (lengths.length === 0) {
    return { isRegular: false, description: 'empty' }
  }
  
  const uniqueLengths = [...new Set(lengths)]
  
  // 情况1：所有乐句长度相同（如 [4,4,4,4]）
  if (uniqueLengths.length === 1) {
    return {
      isRegular: true,
      description: `${uniqueLengths[0]}×${lengths.length}`,
      repeatUnit: uniqueLengths[0],
      repeatCount: lengths.length
    }
  }
  
  // 情况2：两种长度交替（如 [4,4,8,8] 或 [4,8,4,8]）
  if (uniqueLengths.length === 2) {
    // 检查是否为 AB AB 模式
    const halfLength = Math.floor(lengths.length / 2)
    if (halfLength >= 1) {
      const firstHalf = lengths.slice(0, halfLength).join(',')
      const secondHalf = lengths.slice(halfLength, halfLength * 2).join(',')
      
      if (firstHalf === secondHalf) {
        return {
          isRegular: true,
          description: `(${firstHalf})×2`,
          repeatUnit: lengths.slice(0, halfLength),
          repeatCount: 2
        }
      }
    }
    
    // 检查是否为 AA BB 模式
    const pattern = lengths.join('+')
    return {
      isRegular: lengths.length <= 4, // 短序列认为是规则的
      description: pattern
    }
  }
  
  // 情况3：多种长度，检查是否有周期
  const patternLength = findPatternLength(lengths)
  if (patternLength > 0 && patternLength < lengths.length) {
    const unit = lengths.slice(0, patternLength)
    return {
      isRegular: true,
      description: `(${unit.join('+')})×${Math.floor(lengths.length / patternLength)}`,
      repeatUnit: unit,
      repeatCount: Math.floor(lengths.length / patternLength)
    }
  }
  
  // 不规则模式
  return {
    isRegular: false,
    description: lengths.join('+')
  }
}

/**
 * 查找最小重复单元长度
 * @param {Array} lengths - 乐句长度数组
 * @returns {number} 重复单元长度，0表示无重复
 */
function findPatternLength(lengths) {
  for (let patternLen = 1; patternLen <= lengths.length / 2; patternLen++) {
    if (lengths.length % patternLen !== 0) continue
    
    let isPattern = true
    const unit = lengths.slice(0, patternLen)
    
    for (let i = patternLen; i < lengths.length; i++) {
      if (lengths[i] !== unit[i % patternLen]) {
        isPattern = false
        break
      }
    }
    
    if (isPattern) return patternLen
  }
  
  return 0
}

/**
 * 计算置信度
 * @param {boolean} allEven - 是否全为偶数
 * @param {boolean} isSymmetric - 是否对称
 * @param {Object} pattern - 模式信息
 * @returns {number} 置信度 0-1
 */
function calculateConfidence(allEven, isSymmetric, pattern) {
  let confidence = 0.3 // 基础置信度
  
  if (allEven) confidence += 0.25
  if (isSymmetric) confidence += 0.25
  if (pattern.isRegular) confidence += 0.2
  
  return Math.min(confidence, 1.0)
}

/**
 * 计算乐句终止位置（小节号）
 * @param {Array} phrases - 乐句数组
 * @returns {Array} 终止小节号数组
 */
function calculatePhraseEnds(phrases) {
  const ends = []
  let currentMeasure = 0
  
  phrases.forEach(phrase => {
    const length = phrase.measureCount || phrase.length || 0
    currentMeasure += length
    ends.push(currentMeasure)
  })
  
  return ends
}

/**
 * 分类方整性结构类型
 * @returns {Object} 结构类型信息
 */
function classifyStructureType(isSquare, allEven, isSymmetric, pattern, phraseLengths) {
  if (isSquare && allEven && isSymmetric && pattern.isRegular) {
    // 严格方整 (4+4)
    if (phraseLengths.every(len => len === 4)) {
      return {
        type: 'strict_square',
        name: '严格方整',
        example: '4+4',
        boundaryConfidence: 0.90,
        lockedStrategy: '每4小节终止音LOCKED',
        recommendedLevels: [1, 2]
      }
    }
    // 对称方整 (8+8)
    if (phraseLengths.every(len => len === 8)) {
      return {
        type: 'symmetric_square',
        name: '对称方整',
        example: '8+8',
        boundaryConfidence: 0.85,
        lockedStrategy: '每8小节终止音LOCKED',
        recommendedLevels: [2, 3]
      }
    }
  }
  
  // 部分方整 (4+4+3+5)
  if (allEven && !isSymmetric) {
    return {
      type: 'partial_square',
      name: '部分方整',
      example: phraseLengths.join('+'),
      boundaryConfidence: 0.70,
      lockedStrategy: '仅方整部分终止音LOCKED',
      recommendedLevels: [3, 4]
    }
  }
  
  // 非方整 (3+5+7)
  if (!allEven) {
    return {
      type: 'non_square',
      name: '非方整',
      example: phraseLengths.join('+'),
      boundaryConfidence: 0.55,
      lockedStrategy: '依赖MusicVAE语义',
      recommendedLevels: [4, 5]
    }
  }
  
  // 自由结构
  return {
    type: 'free_structure',
    name: '自由结构',
    example: phraseLengths.join('+'),
    boundaryConfidence: 0.40,
    lockedStrategy: '仅明确休止符前LOCKED',
    recommendedLevels: [5]
  }
}

/**
 * 基于方整性结构生成乐句边界建议
 * @param {Object} squareStructure - 方整性分析结果
 * @param {number} totalMeasures - 总小节数
 * @returns {Array} 建议的乐句边界位置
 */
export function generatePhraseBoundariesFromStructure(squareStructure, totalMeasures) {
  const boundaries = []
  
  if (!squareStructure.isSquare) {
    return boundaries
  }
  
  // 根据方整性模式生成边界
  const structureType = squareStructure.structureType
  
  if (structureType.type === 'strict_square') {
    // 每4小节一个边界
    for (let m = 4; m < totalMeasures; m += 4) {
      boundaries.push({
        position: m,
        type: 'square_structure',
        confidence: 0.85,
        source: 'square_rule',
        phraseEnd: m
      })
    }
  } else if (structureType.type === 'symmetric_square') {
    // 每8小节一个边界
    for (let m = 8; m < totalMeasures; m += 8) {
      boundaries.push({
        position: m,
        type: 'square_structure',
        confidence: 0.80,
        source: 'square_rule',
        phraseEnd: m
      })
    }
  } else if (squareStructure.phraseEnds) {
    // 使用已计算的乐句终止位置
    squareStructure.phraseEnds.forEach(end => {
      if (end < totalMeasures) {
        boundaries.push({
          position: end,
          type: 'square_structure',
          confidence: squareStructure.confidence * 0.9,
          source: 'square_rule',
          phraseEnd: end
        })
      }
    })
  }
  
  return boundaries
}

/**
 * 从小节序列自动推断乐句结构
 * 使用启发式方法检测乐句边界
 * @param {Array} measures - 小节数组
 * @param {Object} timeSignature - 拍号
 * @returns {Array} 推断的乐句数组
 */
export function inferPhrasesFromMeasures(measures, timeSignature) {
  if (!measures || measures.length === 0) {
    return []
  }
  
  const phrases = []
  let currentPhraseStart = 0
  
  // 启发式规则：
  // 1. 长休止符后开始新乐句
  // 2. 每4或8小节检查是否有明显的终止特征
  // 3. 大音程跳跃可能是乐句边界
  
  for (let i = 0; i < measures.length; i++) {
    const measure = measures[i]
    const isLastMeasure = i === measures.length - 1
    
    // 检查是否有长休止符（可能是乐句结束）
    const hasLongRest = measure.rests?.some(r => r.duration?.ticks >= 1024)
    
    // 检查是否是4或8小节的倍数
    const measuresSinceStart = i - currentPhraseStart + 1
    const isRegularBoundary = measuresSinceStart === 4 || measuresSinceStart === 8
    
    // 检查最后一个音符是否是长音（可能是终止）
    const lastNote = measure.notes?.[measure.notes.length - 1]
    const endsWithLongNote = lastNote && lastNote.duration?.ticks >= 2048
    
    // 判断是否应该结束当前乐句
    const shouldEndPhrase = isLastMeasure || 
      hasLongRest || 
      (isRegularBoundary && endsWithLongNote)
    
    if (shouldEndPhrase) {
      phrases.push({
        startMeasure: currentPhraseStart + 1, // 1-indexed
        endMeasure: i + 1,
        measureCount: measuresSinceStart,
        length: measuresSinceStart
      })
      currentPhraseStart = i + 1
    }
  }
  
  return phrases
}

export default {
  analyzeSquareStructure,
  generatePhraseBoundariesFromStructure,
  inferPhrasesFromMeasures
}
