/**
 * MusicXML Exporter Module
 * 
 * 核心原则：
 * 1. 同一谱表同一声部同一拍位的音符 = 和弦（使用 <chord/> 标签纵向叠加）
 * 2. 同一谱表不同声部 = 用 backup 分开输出
 * 3. 上下谱表用 backup 切换，确保对齐
 * 4. 每个声部的总时值必须精确等于小节时值
 * 5. 弱起小节使用 implicit="yes" 属性
 * 
 * MusicXML 输出规范：
 * - Staff 1 (上谱表): voice=1 (soprano), voice=2 (alto)
 * - Staff 2 (下谱表): voice=3 (tenor), voice=4 (bass)
 * - 同一声部同一拍位的多个音符用 <chord/> 连接
 */

import JSZip from 'jszip'

/**
 * Export simplified score to MusicXML
 */
export async function exportScore(score, format = 'musicxml') {
  const xmlContent = generateMusicXML(score)
  
  if (format === 'mxl') {
    return await createMxlFile(xmlContent)
  }
  
  return new Blob([xmlContent], { type: 'application/vnd.recordare.musicxml+xml' })
}

/**
 * Generate MusicXML content
 */
function generateMusicXML(score) {
  const { metadata, measures, scoreType, anacrusisInfo } = score
  const divisions = 256 // 每四分音符的分割数
  
  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <work>
    <work-title>${escapeXml(metadata.title)}</work-title>
  </work>
  <identification>
    <creator type="composer">${escapeXml(metadata.composer)}</creator>
    <encoding>
      <software>MusicScoreSimplifier</software>
      <encoding-date>${new Date().toISOString().split('T')[0]}</encoding-date>
    </encoding>
  </identification>
  <part-list>
    <score-part id="P1">
      <part-name>${scoreType === 'grand-staff' ? 'Piano' : 'Part 1'}</part-name>
    </score-part>
  </part-list>
  <part id="P1">
`

  measures.forEach((measure, index) => {
    xml += generateMeasureXML(measure, index === 0, metadata, divisions, scoreType, anacrusisInfo)
  })

  xml += `  </part>
</score-partwise>`

  return xml
}

/**
 * Generate XML for a single measure
 */
function generateMeasureXML(measure, isFirst, metadata, divisions, scoreType, anacrusisInfo) {
  const isAnacrusis = isFirst && anacrusisInfo && anacrusisInfo.isAnacrusis
  const implicitAttr = isAnacrusis ? ' implicit="yes"' : ''
  
  let xml = `    <measure number="${measure.number}"${implicitAttr}>\n`
  
  if (isFirst) {
    xml += generateAttributesXML(metadata, divisions, scoreType)
    if (metadata.tempo) {
      xml += `      <direction placement="above">
        <direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${metadata.tempo}</per-minute></metronome></direction-type>
        <sound tempo="${metadata.tempo}"/>
      </direction>\n`
    }
  }
  
  const notes = measure.notes || []
  const timeSignature = metadata.timeSignature
  const fullMeasureDuration = timeSignature.beats * divisions
  
  // 计算实际小节时值
  let measureDuration = fullMeasureDuration
  if (isAnacrusis) {
    measureDuration = Math.round((anacrusisInfo.pickupDuration / 1024) * divisions)
  }
  
  if (scoreType === 'grand-staff') {
    xml += generateGrandStaffMeasureXML(notes, divisions, measureDuration)
  } else {
    xml += generateSingleStaffMeasureXML(notes, divisions, measureDuration)
  }
  
  xml += `    </measure>\n`
  return xml
}

/**
 * 生成大谱表小节的 XML
 * 
 * 输出顺序：
 * 1. Staff 1, Voice 1 (soprano)
 * 2. backup
 * 3. Staff 1, Voice 2 (alto) - 如果有
 * 4. backup
 * 5. Staff 2, Voice 3 (tenor) - 如果有
 * 6. backup
 * 7. Staff 2, Voice 4 (bass)
 */
function generateGrandStaffMeasureXML(notes, divisions, measureDuration) {
  let xml = ''
  
  // 按谱表和声部分组
  // 优先使用 voicePart 属性，其次使用 voice 编号
  // voice编号：soprano=1, alto=2, tenor=3, bass=4
  const soprano = notes.filter(n => n.staff === 1 && (n.voicePart === 'soprano' || (!n.voicePart && n.voice === 1)))
  const alto = notes.filter(n => n.staff === 1 && (n.voicePart === 'alto' || (!n.voicePart && n.voice === 2)))
  const tenor = notes.filter(n => n.staff === 2 && (n.voicePart === 'tenor' || (!n.voicePart && n.voice === 3)))
  const bass = notes.filter(n => n.staff === 2 && (n.voicePart === 'bass' || (!n.voicePart && n.voice === 4)))
  
  // 如果没有明确的声部标记，按谱表分组
  let upperStaffNotes = soprano.length > 0 || alto.length > 0 
    ? [...soprano, ...alto]
    : notes.filter(n => n.staff === 1)
  let lowerStaffNotes = tenor.length > 0 || bass.length > 0
    ? [...tenor, ...bass]
    : notes.filter(n => n.staff === 2)
  
  // 输出上谱表
  if (upperStaffNotes.length > 0) {
    // 检查是否有多个声部
    const hasMultipleVoices = soprano.length > 0 && alto.length > 0
    
    if (hasMultipleVoices) {
      // 输出 soprano (voice=1)
      const result1 = generateVoiceXML(soprano, 1, 1, divisions, measureDuration)
      xml += result1.xml
      
      // backup 回到小节开头（使用 measureDuration 确保对齐）
      xml += `      <backup><duration>${measureDuration}</duration></backup>\n`
      
      // 输出 alto (voice=2)
      const result2 = generateVoiceXML(alto, 2, 1, divisions, measureDuration)
      xml += result2.xml
    } else {
      // 单声部，所有音符作为 voice=1
      const result = generateVoiceXML(upperStaffNotes, 1, 1, divisions, measureDuration)
      xml += result.xml
    }
  } else {
    xml += generateFullMeasureRest(1, 1, measureDuration)
  }
  
  // backup 回到小节开头，准备输出下谱表（使用 measureDuration 确保对齐）
  xml += `      <backup><duration>${measureDuration}</duration></backup>\n`
  
  // 输出下谱表
  if (lowerStaffNotes.length > 0) {
    // 检查是否有多个声部
    const hasMultipleVoices = tenor.length > 0 && bass.length > 0
    
    if (hasMultipleVoices) {
      // 输出 tenor (voice=3)
      const result1 = generateVoiceXML(tenor, 3, 2, divisions, measureDuration)
      xml += result1.xml
      
      // backup 回到小节开头（使用 measureDuration 确保对齐）
      xml += `      <backup><duration>${measureDuration}</duration></backup>\n`
      
      // 输出 bass (voice=4)
      const result2 = generateVoiceXML(bass, 4, 2, divisions, measureDuration)
      xml += result2.xml
    } else {
      // 单声部，所有音符作为 voice=3
      const result = generateVoiceXML(lowerStaffNotes, 3, 2, divisions, measureDuration)
      xml += result.xml
    }
  } else {
    xml += generateFullMeasureRest(3, 2, measureDuration)
  }
  
  return xml
}

/**
 * 生成单个声部的 XML
 * 
 * 关键：
 * 1. 同一拍位的音符作为和弦输出（如果 allowChords=true）
 * 2. 返回实际输出的总时值（用于 backup）
 * 3. 确保总时值精确等于 measureDuration
 * 
 * @param {Array} notes - 音符数组
 * @param {number} voice - 声部编号
 * @param {number} staff - 谱表编号
 * @param {number} divisions - 每四分音符的分割数
 * @param {number} measureDuration - 小节时值
 * @param {boolean} allowChords - 是否允许和弦输出（默认true）
 */
function generateVoiceXML(notes, voice, staff, divisions, measureDuration, allowChords = true) {
  let xml = ''
  let currentPosition = 0
  
  if (!notes || notes.length === 0) {
    xml = generateFullMeasureRest(voice, staff, measureDuration)
    return { xml, duration: measureDuration }
  }
  
  // 按拍位分组（同一拍位的音符作为和弦）
  const beatGroups = groupNotesByBeat(notes, divisions)
  const sortedBeats = Array.from(beatGroups.keys()).sort((a, b) => a - b)
  
  for (const beat of sortedBeats) {
    const notesAtBeat = beatGroups.get(beat)
    if (!notesAtBeat || notesAtBeat.length === 0) continue
    
    // 计算音符位置（从0开始，单位是 divisions）
    const notePosition = Math.round(beat * divisions)
    
    // 如果位置超过小节时值，跳过
    if (notePosition >= measureDuration) continue
    
    // 如果需要，添加休止符填充空白
    if (notePosition > currentPosition) {
      const gap = notePosition - currentPosition
      xml += generateRestsForDuration(gap, voice, staff, divisions)
      currentPosition = notePosition
    }
    
    // 按音高排序（高音在前）
    const sortedNotes = [...notesAtBeat].sort((a, b) => {
      return pitchToMidi(b.pitch) - pitchToMidi(a.pitch)
    })
    
    // 获取音符时值，确保不超过小节剩余时值
    let noteDuration = Math.round((sortedNotes[0].duration?.ticks || 1024) / 1024 * divisions)
    const remainingDuration = measureDuration - notePosition
    if (noteDuration > remainingDuration) {
      noteDuration = remainingDuration
    }
    
    // 输出音符
    if (allowChords) {
      // 输出和弦中的所有音符
      sortedNotes.forEach((note, idx) => {
        const isChord = idx > 0
        xml += generateNoteXML(note, noteDuration, voice, staff, isChord)
      })
    } else {
      // 🆕 单旋律：只输出第一个音符（最高音）
      xml += generateNoteXML(sortedNotes[0], noteDuration, voice, staff, false)
    }
    
    currentPosition = notePosition + noteDuration
  }
  
  // 填充小节末尾的空白
  if (currentPosition < measureDuration) {
    const gap = measureDuration - currentPosition
    xml += generateRestsForDuration(gap, voice, staff, divisions)
    currentPosition = measureDuration
  }
  
  return { xml, duration: currentPosition }
}

/**
 * 按拍位分组音符
 * 使用 1/4 拍精度来分组，确保同一拍位的音符被正确分组
 */
function groupNotesByBeat(notes, divisions) {
  const groups = new Map()
  
  notes.forEach(note => {
    // startBeat 从 1 开始，转换为从 0 开始
    // 使用 1/4 拍精度（即 1/16 音符精度）
    const beatFrom0 = note.startBeat - 1
    const beat = Math.round(beatFrom0 * 4) / 4
    
    if (!groups.has(beat)) {
      groups.set(beat, [])
    }
    groups.get(beat).push(note)
  })
  
  return groups
}

/**
 * 计算 MIDI 音高值
 */
function pitchToMidi(pitch) {
  const stepValues = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
  return (pitch.octave + 1) * 12 + stepValues[pitch.step] + (pitch.alter || 0)
}

/**
 * 生成单行谱小节的 XML
 * 
 * 单旋律乐谱：每个拍位只保留一个音符（最高音），不输出和弦
 */
function generateSingleStaffMeasureXML(notes, divisions, measureDuration) {
  if (!notes || notes.length === 0) {
    return generateFullMeasureRest(1, 1, measureDuration)
  }
  
  // 🆕 单旋律乐谱：去重，每个拍位只保留一个音符
  const deduplicatedNotes = deduplicateNotesByBeat(notes)
  
  const result = generateVoiceXML(deduplicatedNotes, 1, 1, divisions, measureDuration, false) // false = 不输出和弦
  return result.xml
}

/**
 * 🆕 按拍位去重音符，每个拍位只保留最高音
 */
function deduplicateNotesByBeat(notes) {
  const beatGroups = new Map()
  
  notes.forEach(note => {
    const beatKey = Math.round((note.startBeat - 1) * 4) / 4
    if (!beatGroups.has(beatKey)) {
      beatGroups.set(beatKey, [])
    }
    beatGroups.get(beatKey).push(note)
  })
  
  const result = []
  beatGroups.forEach(notesAtBeat => {
    // 按音高排序，保留最高音
    const sorted = [...notesAtBeat].sort((a, b) => {
      return pitchToMidi(b.pitch) - pitchToMidi(a.pitch)
    })
    result.push(sorted[0])
  })
  
  return result
}

/**
 * 生成休止符填充
 */
function generateRestsForDuration(totalDuration, voice, staff, divisions) {
  let xml = ''
  let remaining = totalDuration
  
  const restValues = [
    { duration: divisions * 4, type: 'whole' },
    { duration: divisions * 2, type: 'half' },
    { duration: divisions, type: 'quarter' },
    { duration: divisions / 2, type: 'eighth' },
    { duration: divisions / 4, type: '16th' },
    { duration: divisions / 8, type: '32nd' }
  ]
  
  while (remaining > 0.5) {
    let found = false
    for (const rv of restValues) {
      if (rv.duration <= remaining + 0.5) {
        xml += `      <note>
        <rest/>
        <duration>${Math.round(rv.duration)}</duration>
        <voice>${voice}</voice>
        <type>${rv.type}</type>
        <staff>${staff}</staff>
      </note>\n`
        remaining -= rv.duration
        found = true
        break
      }
    }
    if (!found) break
  }
  
  return xml
}

/**
 * 生成全小节休止符
 */
function generateFullMeasureRest(voice, staff, measureDuration) {
  return `      <note>
        <rest measure="yes"/>
        <duration>${measureDuration}</duration>
        <voice>${voice}</voice>
        <staff>${staff}</staff>
      </note>\n`
}

/**
 * Generate attributes XML
 */
function generateAttributesXML(metadata, divisions, scoreType) {
  const { timeSignature, keySignature } = metadata
  
  let xml = `      <attributes>
        <divisions>${divisions}</divisions>
        <key><fifths>${keySignature.fifths}</fifths></key>
        <time><beats>${timeSignature.beats}</beats><beat-type>${timeSignature.beatType}</beat-type></time>\n`
  
  if (scoreType === 'grand-staff') {
    xml += `        <staves>2</staves>
        <clef number="1"><sign>G</sign><line>2</line></clef>
        <clef number="2"><sign>F</sign><line>4</line></clef>\n`
  } else {
    xml += `        <clef><sign>G</sign><line>2</line></clef>\n`
  }
  
  xml += `      </attributes>\n`
  return xml
}

/**
 * Generate note XML
 * @param {Object} note - 音符对象
 * @param {number} duration - XML duration 值（已计算好的）
 * @param {number} voice - 声部编号
 * @param {number} staff - 谱表编号
 * @param {boolean} isChord - 是否为和弦音
 */
function generateNoteXML(note, duration, voice, staff, isChord = false) {
  let xml = `      <note>\n`
  
  if (isChord) {
    xml += `        <chord/>\n`
  }
  
  xml += `        <pitch>
          <step>${note.pitch.step}</step>
          ${note.pitch.alter ? `<alter>${note.pitch.alter}</alter>` : ''}
          <octave>${note.pitch.octave}</octave>
        </pitch>\n`
  
  xml += `        <duration>${duration}</duration>\n`
  
  if (note.tiedTo) {
    xml += `        <tie type="start"/>\n`
  }
  
  xml += `        <voice>${voice}</voice>\n`
  xml += `        <type>${durationToType(note.duration?.type || 'quarter')}</type>\n`
  
  for (let i = 0; i < (note.duration?.dots || 0); i++) {
    xml += `        <dot/>\n`
  }
  
  if (note.duration?.tuplet) {
    const { actual, normal } = note.duration.tuplet
    xml += `        <time-modification>
          <actual-notes>${actual}</actual-notes>
          <normal-notes>${normal}</normal-notes>
        </time-modification>\n`
  }
  
  xml += `        <staff>${staff}</staff>\n`
  
  if (note.tiedTo) {
    xml += `        <notations><tied type="start"/></notations>\n`
  }
  
  xml += `      </note>\n`
  return xml
}

function durationToType(type) {
  const typeMap = {
    'whole': 'whole', 'half': 'half', 'quarter': 'quarter',
    'eighth': 'eighth', 'sixteenth': '16th', '32nd': '32nd'
  }
  return typeMap[type] || 'quarter'
}

async function createMxlFile(xmlContent) {
  const zip = new JSZip()
  
  const containerXml = `<?xml version="1.0" encoding="UTF-8"?>
<container>
  <rootfiles>
    <rootfile full-path="score.xml"/>
  </rootfiles>
</container>`
  
  zip.file('META-INF/container.xml', containerXml)
  zip.file('score.xml', xmlContent)
  
  return await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.recordare.musicxml' })
}

function escapeXml(str) {
  if (!str) return ''
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
