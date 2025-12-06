/**
 * Phrase Boundary Detector Module (Enhanced Version)
 * 乐句边界检测增强版
 * 
 * 根据 MSS模型组合架构方案1-1.md 规范：
 * - 规则层：长休止符、大音程跳跃
 * - 方整性规则层：基于方整结构的边界
 * - AI层：MusicVAE语义断裂检测
 * - 融合去重：优先级 方整性 > 长休止 > 语义 > 跳跃
 */

import { pitchToMidi } from '../knowledge/index.js'
import { generatePhraseBoundariesFromStructure } from './square-structure-analyzer.js'

/**
 * 检测乐句边界（增强版，结合方整性）
 * @param {Array} notes - 音符数组
 * @param {Object} squareStructure - 方整性分析结果
 * @param {Array} embeddings - MusicVAE embeddings（可选）
 * @param {Object} options - 配置选项
 * @returns {Array} 乐句边界数组
 */
export function detectPhraseBoundariesEnhanced(notes, squareStructure, embeddings = null, options = {}) {
  const boundaries = []
  const {
    restThreshold = 1024,      // 长休止符阈值（四分音符）
    leapThreshold = 12,        // 大跳跃阈值（八度）
    similarityThreshold = 0.7, // 语义相似度阈值
    totalMeasures = 0
  } = options

  // 1. 规则层：长休止符检测
  const restBoundaries = detectRestBoundaries(notes, restThreshold)
  boundaries.push(...restBoundaries)

  // 2. 规则层：大音程跳跃检测
  const leapBoundaries = detectLeapBoundaries(notes, leapThreshold)
  boundaries.push(...leapBoundaries)

  // 3. 方整性规则层
  if (squareStructure && squareStructure.isSquare) {
    const squareBoundaries = generatePhraseBoundariesFromStructure(
      squareStructure, 
      totalMeasures || estimateTotalMeasures(notes)
    )
    boundaries.push(...squareBoundaries)
  }

  // 4. AI层：MusicVAE语义断裂检测
  if (embeddings && embeddings.length > 0) {
    const semanticBoundaries = detectSemanticBoundaries(embeddings, similarityThreshold)
    boundaries.push(...semanticBoundaries)
  }

  // 5. 融合去重
  const mergedBoundaries = mergeBoundaries(boundaries, {
    priorityOrder: ['square_rule', 'rest', 'musicvae', 'leap'],
    mergeDistance: 2 // 相邻2个音符内的边界合并
  })

  return mergedBoundaries
}

/**
 * 检测长休止符边界
 * @param {Array} notes - 音符数组
 * @param {number} threshold - 休止符时长阈值
 * @returns {Array} 边界数组
 */
function detectRestBoundaries(notes, threshold) {
  const boundaries = []
  
  if (!notes || notes.length < 2) return boundaries

  for (let i = 0; i < notes.length - 1; i++) {
    const currentNote = notes[i]
    const nextNote = notes[i + 1]
    
    // 计算两个音符之间的间隔
    const currentEnd = currentNote.startBeat + (currentNote.duration?.ticks || 0) / 1024
    const gap = (nextNote.startBeat - currentEnd) * 1024 // 转换为 ticks
    
    if (gap >= threshold) {
      boundaries.push({
        position: i + 1,
        noteIndex: i + 1,
        type: 'rest',
        confidence: Math.min(0.9, 0.7 + (gap / threshold) * 0.2),
        source: 'rest',
        gapDuration: gap
      })
    }
  }

  return boundaries
}

/**
 * 检测大音程跳跃边界
 * @param {Array} notes - 音符数组
 * @param {number} threshold - 跳跃阈值（半音数）
 * @returns {Array} 边界数组
 */
function detectLeapBoundaries(notes, threshold) {
  const boundaries = []
  
  if (!notes || notes.length < 2) return boundaries

  for (let i = 0; i < notes.length - 1; i++) {
    const currentNote = notes[i]
    const nextNote = notes[i + 1]
    
    // 跳过装饰音
    if (currentNote.embellishment || nextNote.embellishment) continue
    
    const currentMidi = pitchToMidi(currentNote.pitch)
    const nextMidi = pitchToMidi(nextNote.pitch)
    const interval = Math.abs(nextMidi - currentMidi)
    
    if (interval > threshold) {
      boundaries.push({
        position: i + 1,
        noteIndex: i + 1,
        type: 'leap',
        confidence: Math.min(0.8, 0.5 + (interval - threshold) / 12 * 0.3),
        source: 'leap',
        interval: interval
      })
    }
  }

  return boundaries
}

/**
 * 检测语义断裂边界（基于MusicVAE embeddings）
 * @param {Array} embeddings - embedding向量数组
 * @param {number} threshold - 相似度阈值
 * @returns {Array} 边界数组
 */
function detectSemanticBoundaries(embeddings, threshold) {
  const boundaries = []
  
  if (!embeddings || embeddings.length < 2) return boundaries

  for (let i = 0; i < embeddings.length - 1; i++) {
    const similarity = cosineSimilarity(embeddings[i], embeddings[i + 1])
    
    if (similarity < threshold) {
      boundaries.push({
        position: i + 1,
        noteIndex: i + 1,
        type: 'semantic',
        confidence: 1 - similarity, // 相似度越低，置信度越高
        source: 'musicvae',
        similarity: similarity
      })
    }
  }

  return boundaries
}

/**
 * 计算余弦相似度
 * @param {Array} vecA - 向量A
 * @param {Array} vecB - 向量B
 * @returns {number} 相似度 0-1
 */
function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) {
    return 0
  }

  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i]
    normA += vecA[i] * vecA[i]
    normB += vecB[i] * vecB[i]
  }

  normA = Math.sqrt(normA)
  normB = Math.sqrt(normB)

  if (normA === 0 || normB === 0) return 0

  return dotProduct / (normA * normB)
}

/**
 * 融合去重边界
 * @param {Array} boundaries - 所有边界
 * @param {Object} config - 配置 { priorityOrder, mergeDistance }
 * @returns {Array} 合并后的边界
 */
function mergeBoundaries(boundaries, config) {
  const { priorityOrder, mergeDistance = 2 } = config
  
  if (boundaries.length === 0) return []

  // 按位置排序
  const sorted = [...boundaries].sort((a, b) => a.position - b.position)
  
  // 分组合并相邻边界
  const grouped = []
  let currentGroup = [sorted[0]]

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i]
    const lastInGroup = currentGroup[currentGroup.length - 1]
    
    if (Math.abs(current.position - lastInGroup.position) <= mergeDistance) {
      currentGroup.push(current)
    } else {
      // 从当前组选择最佳边界
      grouped.push(selectBestBoundary(currentGroup, priorityOrder))
      currentGroup = [current]
    }
  }
  
  // 处理最后一组
  if (currentGroup.length > 0) {
    grouped.push(selectBestBoundary(currentGroup, priorityOrder))
  }

  return grouped
}

/**
 * 从一组边界中选择最佳的一个
 * @param {Array} group - 边界组
 * @param {Array} priorityOrder - 优先级顺序
 * @returns {Object} 最佳边界
 */
function selectBestBoundary(group, priorityOrder) {
  if (group.length === 1) return group[0]

  // 按优先级排序
  const sorted = [...group].sort((a, b) => {
    const priorityA = priorityOrder.indexOf(a.source)
    const priorityB = priorityOrder.indexOf(b.source)
    
    // 优先级相同时，选择置信度更高的
    if (priorityA === priorityB) {
      return b.confidence - a.confidence
    }
    
    // 未在优先级列表中的排最后
    if (priorityA === -1) return 1
    if (priorityB === -1) return -1
    
    return priorityA - priorityB
  })

  // 返回最高优先级的边界，但合并其他边界的信息
  const best = { ...sorted[0] }
  best.mergedFrom = group.map(b => b.source)
  best.mergedConfidences = group.map(b => b.confidence)
  
  return best
}

/**
 * 估算总小节数
 * @param {Array} notes - 音符数组
 * @returns {number} 估算的小节数
 */
function estimateTotalMeasures(notes) {
  if (!notes || notes.length === 0) return 0
  
  // 找到最大的 measureNumber
  let maxMeasure = 0
  notes.forEach(note => {
    if (note.measureNumber && note.measureNumber > maxMeasure) {
      maxMeasure = note.measureNumber
    }
  })
  
  return maxMeasure || Math.ceil(notes.length / 4) // 默认假设每小节4个音符
}

/**
 * 标记乐句终止音为LOCKED
 * @param {Array} notes - 音符数组
 * @param {Array} boundaries - 乐句边界
 * @param {Object} squareStructure - 方整性结构
 * @returns {Array} 标记后的音符
 */
export function markPhraseEndingsAsLocked(notes, boundaries, squareStructure) {
  if (!notes || notes.length === 0) return notes

  const result = notes.map(note => ({ ...note }))
  
  // 标记边界前的音符为乐句终止音
  boundaries.forEach(boundary => {
    const noteIndex = boundary.noteIndex || boundary.position
    if (noteIndex > 0 && noteIndex <= result.length) {
      const endNote = result[noteIndex - 1]
      
      // 根据边界来源设置不同的锁定原因
      if (boundary.source === 'square_rule') {
        endNote.isLocked = true
        endNote.lockReason = 'square_phrase_cadence'
        endNote.lockPriority = 2
      } else if (!endNote.isLocked) {
        endNote.isLocked = true
        endNote.lockReason = 'phrase_cadence'
        endNote.lockPriority = 3
      }
      
      endNote.isPhraseEnd = true
    }
  })

  return result
}

/**
 * 获取乐句边界检测的默认配置
 * @param {Object} squareStructure - 方整性结构
 * @returns {Object} 配置对象
 */
export function getDefaultBoundaryConfig(squareStructure) {
  const structureType = squareStructure?.structureType?.type || 'free_structure'
  
  const configs = {
    strict_square: {
      restThreshold: 1024,
      leapThreshold: 14,
      similarityThreshold: 0.6,
      useSquareRules: true,
      squareWeight: 0.9
    },
    symmetric_square: {
      restThreshold: 1024,
      leapThreshold: 13,
      similarityThreshold: 0.65,
      useSquareRules: true,
      squareWeight: 0.85
    },
    partial_square: {
      restThreshold: 960,
      leapThreshold: 12,
      similarityThreshold: 0.7,
      useSquareRules: true,
      squareWeight: 0.7
    },
    non_square: {
      restThreshold: 768,
      leapThreshold: 10,
      similarityThreshold: 0.75,
      useSquareRules: false,
      squareWeight: 0.5
    },
    free_structure: {
      restThreshold: 512,
      leapThreshold: 8,
      similarityThreshold: 0.8,
      useSquareRules: false,
      squareWeight: 0.3
    }
  }

  return configs[structureType] || configs.free_structure
}

export default {
  detectPhraseBoundariesEnhanced,
  markPhraseEndingsAsLocked,
  getDefaultBoundaryConfig,
  cosineSimilarity
}
