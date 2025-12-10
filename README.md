# Music Score Simplifier (MSS)

A pure frontend web application that provides intelligent graded simplification of musical scores for instrument beginners. The application processes MusicXML files (.mxl/.musicxml) and applies a hybrid approach combining rule-based processing and AI-assisted analysis to produce easier-to-play versions while preserving musical integrity.

## Overview

This application helps music learners by creating simplified versions of complex musical scores. It supports both **monophonic instruments** (violin, flute, cello，…) with single-staff notation and **polyphonic instruments** (piano，harpsichord，…) with grand-staff notation. The system provides 5 progressive difficulty levels, allowing learners to gradually transition from simplified versions to the original score.

## Core Features

### File Processing
- **Input Formats**: .mxl and .musicxml (MuseScore compatible)
- **Output Formats**: .mxl and .musicxml (MuseScore compatible)
- **Score Types**: Single-staff (monophonic) and Grand-staff (polyphonic)

### Intelligent Analysis
- **4-Layer Architecture**: Structure parsing → Symbol recognition → AI-assisted analysis → Rule-based simplification
- **AI-Powered Voice Separation**: MusicVAE + KNN + K-Means for SATB voice identification
- **Anacrusis Detection**: Automatic pickup measure detection and preservation
- **Square/Non-Square Structure Recognition**: Phrase structure analysis for classical and modern music
- **Phrase Boundary Detection**: Multi-layer detection combining rules, structure patterns, and AI semantics

### Musical Element Recognition
- **A-Class Elements** (Deterministic): Staff structure, clefs, time signatures, key signatures, pitch, duration, noteheads, stems, beams, rests, dots, ties, slurs, ornaments, anacrusis, square structure
- **B-Class Elements** (AI-Assisted): Strong beat positions, SATB voice separation, soprano/bass lines, melody contour, rhythm patterns, phrase boundaries

### Protection Mechanisms
- **LOCKED Note System**: 6-level priority system protecting important musical elements
- **Anacrusis Protection**: Pickup measure notes preserved at highest priority (Priority 0)
- **Rhythm Pattern Protection**: Syncopation, dotted rhythms, ties across beats (Priority 1)
- **Structural Protection**: Square phrase endings, melody turning points (Priority 2)
- **Phrase Endings**: Cadence notes marked as LOCKED (Priority 3)

### Customization Options
- **5 Simplification Levels**: Progressive difficulty from skeleton to near-original
- **Voice-Level Customization**: Independent level selection for Soprano and Bass in grand-staff mode
- **Flexible Configuration**: Each level offers multiple sub-options for fine-tuned control

## Live Demo

**Try it now**:https://music-score-simplifier-v87.vercel.app/

## Recent Updates (v8.7)

### New Features
- **Enhanced Voice Separation**: 5-step algorithm (MusicVAE embedding → KNN classification → K-Means clustering → Continuity optimization → Fragment handling)
- **Square Structure Analysis**: Recognition of regular phrase patterns (4+4, 8+8) vs irregular patterns (3+5, 7+3)
- **Anacrusis Smart Protection**: Complete preservation of pickup measures with highest priority
- **Phrase Boundary Enhancement**: Combines rule-based detection, square structure patterns, and MusicVAE semantic analysis

### Critical Fixes
- **Staff Alignment**: Fixed upper/lower staff synchronization issues
- **Voice Layout**: Same-staff voices (soprano+alto, tenor+bass) now output vertically using proper `<backup>` elements
- **Single-Staff Deduplication**: Eliminated double notes in monophonic scores
- **Measure Duration Accuracy**: All voices precisely match measure duration with proper rest filling

## Simplification Levels

### Single-Staff (Monophonic Instruments)

| Level | Preserved Notes | Duration Handling | Special Processing | Anacrusis Handling | Typical Use Case |
|-------|----------------|-------------------|-------------------|-------------------|------------------|
| **Level 1** | First note per measure | Extended to full measure | None | Keep first note, preserve original duration | Extreme beginners, melody outline |
| **Level 2** | Strong beat positions | Extended to next strong beat | 2/4: beat 1<br>3/4: beat 1<br>4/4: beats 1,3<br>6/8: beats 1,4 | Fully preserve all notes | Strong beat awareness training |
| **Level 3** | First note of each beat | Extended to next beat | Remove subdivisions within beats | Fully preserve all notes | Steady beat training |
| **Level 4** | ≥Quarter notes + Eighth notes + LOCKED | 16th→8th (first of group)<br>32nd→8th | **Protect**: syncopation, dotted rhythms, ties, turning points<br>**Remove**: ornaments | All notes marked LOCKED | Advanced learning, musicality preserved |
| **Level 5** | All non-ornament notes | Preserve original | Remove trill/turn/mordent only | Fully preserve original | Near-original performance |

### Grand Staff (Polyphonic Instruments)

| Level | Voices | Soprano (Upper) | Alto (Upper) | Tenor (Lower) | Bass (Lower) | Anacrusis Handling | Core Feature |
|-------|--------|----------------|--------------|---------------|--------------|-------------------|--------------|
| **Level 1** | 2 (S+B) | Customizable L1-5<br>(default L4) | ❌ Not active | ❌ Not active | First note per measure<br>Customizable L1-5 | All voices preserve pickup | Two-voice skeleton, most simplified |
| **Level 2** | 3 (S+A+B) | Customizable L2-5<br>(default L4) | Strong beats extended | ❌ Not active | Strong beats extended<br>Customizable L2-5 | All voices fully preserve | Right-hand enhanced, three-part harmony |
| **Level 3** | 3 (S+T+B) | Customizable L2-5<br>(default L5) | ❌ Not active | Strong beats extended | Strong beats extended<br>Customizable L2-5 | All voices fully preserve | Left-hand enhanced, three-part harmony |
| **Level 4** | 4 (SATB) | Customizable L2-5<br>(default L4) | Strong beats extended | Strong beats extended | Strong beats extended<br>Customizable L2-5 | All SATB voices LOCKED | Four-part harmony, strong beat simplified |
| **Level 5** | 4 (SATB) | Customizable L4-5<br>(default L5) | Rhythm normalized (≥8th) | Rhythm normalized (≥8th) | Customizable L4-5<br>(default L5) | Fully preserve original | Four-part near-original restoration |

### Voice Separation Method

The system uses a **5-step hybrid algorithm** for SATB voice identification:

1. **MusicVAE Embedding**: Generate 512-dimensional semantic vectors for each note
2. **KNN Classification**: k=5 neighbor classification based on 25-dimensional features (pitch + duration + embedding)
3. **K-Means Clustering**: k=2-4 clustering for simultaneous notes (chords)
4. **Continuity Optimization**: Dynamic programming to minimize melodic leaps (>8 semitones trigger voice swap)
5. **Fragment Handling**: Merge short notes (<quarter) in Alto/Tenor, fill gaps with rests

## Technology Stack

### Core Technologies
- **Frontend Framework**: Vue.js 3 (Composition API)
- **Build Tool**: Vite 6.x
- **Language**: JavaScript (ES2020+)

### AI/ML Libraries
- **Magenta.js**: MusicVAE model for music semantic understanding (20% of processing)
- **TensorFlow.js**: Neural network inference engine (5% for validation)
- **ml-knn**: K-Nearest Neighbors classifier for voice separation (20%)
- **ml-kmeans**: K-Means clustering for chord analysis (20%)
- **ml-pca**: Principal Component Analysis for feature reduction

### Music Processing
- **JSZip**: .mxl file compression/decompression
- **Native JavaScript**: MusicXML DOM parsing and reconstruction (35%)

### Architecture
- **Zero-Shot Learning**: No training required, pure inference mode
- **Chunk Processing**: 8-measure chunks with 1-measure overlap
- **Web Workers**: Background processing for large files
- **Memory Management**: LRU cache with 50MB limit

## Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn

### Installation
```bash
npm install
```

### Development
```bash
npm run dev
```
Opens at http://localhost:5173

### Build for Production
```bash
npm run build
```

### Preview Production Build
```bash
npm run preview
```

## Deployment

### Vercel (Recommended)
1. Connect your repository to Vercel
2. Vercel will automatically detect Vite and deploy
3. Configuration in `vercel.json` handles SPA routing

### Manual Deployment
1. Build the project: `npm run build`
2. Deploy the `dist` folder to any static hosting service


## Project Structure

```
music-score-simplifierV86/
├── src/
│   ├── ai/                          # AI/ML Layer (20%)
│   │   ├── index.js                 # AI module exports
│   │   └── voiceSeparation.js       # MusicVAE + KNN + K-Means (5-step algorithm)
│   ├── components/                  # Vue Components (15%)
│   │   ├── FileUploader.vue         # File upload with drag-drop
│   │   ├── LevelSelector.vue        # Level selection with descriptions
│   │   ├── NotificationManager.vue  # Toast notifications (15s auto-close)
│   │   ├── ScorePreview.vue         # Score preview (optional)
│   │   └── ScoreTypeSelector.vue    # Single-staff vs Grand-staff
│   ├── knowledge/                   # Music Theory Knowledge Base
│   │   └── index.js                 # Clefs, keys, time signatures, strong beats
│   ├── modules/                     # Core Processing Modules (35%)
│   │   ├── parser.js                # Layer 1: MusicXML DOM parsing
│   │   ├── analyzer.js              # Layer 2+3: Symbol + AI analysis
│   │   ├── simplifier.js            # Layer 4: Simplification orchestration
│   │   ├── exporter.js              # MusicXML reconstruction with alignment
│   │   ├── anacrusis-detector.js    # Pickup measure detection
│   │   ├── square-structure-analyzer.js # Phrase structure analysis
│   │   └── phrase-boundary-detector.js  # Multi-layer boundary detection
│   ├── rules/                       # Simplification Rules (20%)
│   │   ├── index.js                 # Rules exports
│   │   ├── singleStaff.js           # Single-staff Level 1-5 rules
│   │   └── grandStaff.js            # Grand-staff SATB Level 1-5 rules
│   ├── types/
│   │   └── index.js                 # TypeScript-style type definitions
│   ├── utils/                       # Utilities (5%)
│   │   ├── index.js                 # Utility exports
│   │   ├── chunkProcessor.js        # 8-measure chunk processing
│   │   └── memoryManager.js         # LRU cache + memory management
│   ├── workers/
│   │   └── simplifyWorker.js        # Web Worker for background processing
│   ├── App.vue                      # Main application component
│   ├── main.js                      # Application entry point
│   └── style.css                    # Global styles
├── public/
│   └── vite.svg                     # Favicon
├── index.html                       # HTML entry point
├── package.json                     # Dependencies and scripts
├── package-lock.json                # Dependency lock file
├── vite.config.js                   # Vite build configuration
├── vercel.json                      # Vercel deployment config
├── netlify.toml                     # Netlify deployment config (alternative)
├── .gitignore                       # Git ignore rules
├── .gitattributes                   # Git attributes
└── README.md                        # This file
```

## System Architecture

### 4-Layer Processing Pipeline

```
┌─────────────────────────────────────────────────────────┐
│  Layer 1: MusicXML Structure Parsing                    │
│  - DOM tree parsing                                     │
│  - Metadata extraction                                  │
│  - Staff/voice/measure structuring                      │
│  - Anacrusis detection                                  │
│  - Square structure analysis                            │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Layer 2: Deterministic Symbol Recognition              │
│  - Clef/key/time signature extraction                   │
│  - Pitch/duration calculation                           │
│  - Notehead/stem/beam identification                    │
│  - Rest/dot/tie/slur/ornament detection                 │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Layer 3: AI-Assisted Perception Analysis               │
│  - MusicVAE embedding generation                        │
│  - KNN voice classification (SATB)                      │
│  - K-Means chord clustering                             │
│  - Melody/bass line contour extraction                  │
│  - Rhythm pattern matching                              │
│  - Phrase boundary detection (rules + AI)               │
│  - LOCKED note marking                                  │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Layer 4: Rule Engine Simplification                    │
│  - Level-based simplification (L1-L5)                   │
│  - Independent SATB voice processing                    │
│  - Anacrusis protection                                 │
│  - LOCKED note preservation                             │
│  - MusicXML reconstruction                              │
└─────────────────────────────────────────────────────────┘
```

### MusicXML Output Specification

**Grand Staff Voice Numbering**:
- **Staff 1 (Upper)**: voice=1 (Soprano, stem up), voice=2 (Alto, stem down)
- **Staff 2 (Lower)**: voice=3 (Tenor, stem up), voice=4 (Bass, stem down)

**Critical Rules**:
- Same-staff voices output **vertically** (soprano → `<backup>` → alto)
- Each voice duration = measure duration (filled with notes/rests)
- All `<backup>` elements use `measureDuration` for alignment
- Single-staff scores: one note per beat position (no chords)

### LOCKED Note Priority System

| Priority | Lock Reason | Detection Criteria | Applied Levels | Simplification Impact |
|----------|-------------|-------------------|----------------|----------------------|
| **0** | `anacrusis_note` | First measure AND isAnacrusis=true | **All Levels** | **Absolute protection, no modification** |
| **1** | `syncopation` | Weak beat start + Tie + covers strong beat | Level 4-5 | Preserve rhythm pattern and tie |
| **1** | `tie_across_beat` | Tie crosses beat point or barline | Level 4-5 | Merge duration, mark LOCKED |
| **2** | `square_phrase_cadence` | Square structure (4+4, 8+8) phrase endings | Level 3-5 | Mark last note of phrase LOCKED |
| **2** | `dotted_rhythm` | dots>0 AND duration≥eighth note | Level 4-5 | Preserve dotted pattern |
| **2** | `melodic_turning_point` | Local max/min + leap >5 semitones | Level 4-5 | Mark contour peak LOCKED |
| **3** | `phrase_cadence` | Note before ≥quarter rest | Level 4-5 | Mark ending note LOCKED |
| **3** | `long_strong_beat` | Strong beat + duration≥half note | Level 3-5 | Preserve long note |

### Anacrusis (Pickup Measure) Handling

**Detection Criteria**:
- First measure duration < full measure duration
- Typically 1-3 notes starting on weak beat
- May have compensation measure at the end

**Protection Strategy**:
| Level | Anacrusis Processing |
|-------|---------------------|
| Level 1 | Keep first note, preserve original duration (no extension) |
| Level 2-3 | Fully preserve all notes (mark all as LOCKED) |
| Level 4-5 | Complete preservation of original notation |

### Square Structure Recognition

**Structure Types**:
| Type | Pattern | Phrase Boundary Confidence | LOCKED Strategy | Typical Repertoire |
|------|---------|---------------------------|-----------------|-------------------|
| **Strict Square** | 4+4, 8+8 | 0.85-0.95 | Every 4/8 measures ending LOCKED | Mozart sonatas |
| **Symmetric Square** | 2+2+4+4 | 0.80-0.90 | Pattern-based endings LOCKED | Classical dances |
| **Partial Square** | 4+4+3+5 | 0.60-0.75 | Only square section endings LOCKED | Romantic period |
| **Non-Square** | 3+5, 7+3 | 0.40-0.65 | Rely on MusicVAE semantics | Chopin nocturnes |
| **Free Structure** | Irregular | 0.30-0.50 | Only explicit rests before LOCKED | Modern music |

## Performance Metrics

| Metric | Target | Implementation |
|--------|--------|----------------|
| **MusicXML Parsing** | 100 measures / 200ms | Native DOM + streaming |
| **Anacrusis Detection** | 100 measures / 20ms | Duration comparison |
| **Square Structure Analysis** | 100 measures / 50ms | Pattern matching |
| **Voice Separation (MusicVAE+KNN)** | 100 measures / 500ms | Async processing + vector cache |
| **K-Means Clustering** | Per measure / 5ms | ml-kmeans optimized |
| **Phrase Boundary Detection** | 100 measures / 100ms | Rules + square + MusicVAE |
| **Simplification (single voice)** | 100 measures / 50ms | Rule engine + fast indexing |
| **MusicXML Reconstruction** | 100 measures / 300ms | Template-based XML generation |
| **Total Processing Time** | 100 measures < 2.2s | Chunk parallel + Worker pool |
| **Memory Usage** | Single score < 50MB | Chunk loading + LRU cache |
| **Model First Load** | < 5s | CDN acceleration + lazy loading |

## Key Innovations

| Innovation | Technical Solution | Advantage |
|-----------|-------------------|-----------|
| **3-Layer Voice Separation** | MusicVAE embedding → KNN classification → K-Means clustering | Semantic understanding + zero-training + multi-dimensional |
| **LOCKED Protection System** | Identify 8 types of critical rhythm patterns | Preserve musicality after simplification |
| **Anacrusis Smart Protection** | Detect first measure duration + mark all notes LOCKED | Preserve pickup measure characteristics |
| **Square Structure Awareness** | Analyze phrase length patterns + rule+AI hybrid boundary detection | Optimize for classical vs modern styles |
| **Configurable Grading** | 5 Levels + Soprano/Bass sub-level options | Meet different learning stages |
| **Chunk Parallel Processing** | 8-measure chunks + Web Worker multi-threading | 100 measures < 2.2s, memory < 50MB |
| **Pure Frontend** | Zero backend dependency, runs in browser | Simple deployment, user privacy |

## Comparison: Traditional vs MSS

| Dimension | Traditional Auto-Simplification | 🎯 MSS (This Project) |
|-----------|--------------------------------|----------------------|
| **Anacrusis** | Often incorrectly simplified or deleted | **Detect + fully protect, preserve original** |
| **Square Structure** | Ignore phrase structure | **Analyze square patterns, intelligently mark endings** |
| **Voice Separation** | Pitch-based rules, error-prone | **MusicVAE semantics + KNN + K-Means 3-layer** |
| **Syncopation** | Often destroyed by beat-head simplification | **LOCKED mechanism, absolute protection** |
| **Phrase Boundaries** | Only rely on rests | **Rules + square + MusicVAE semantics triple detection** |
| **Simplification Strategy** | One-size-fits-all | **5 levels configurable + independent voice options** |

## Known Limitations

- **Browser Requirements**: WebGL support required for AI features (MusicVAE)
- **File Size**: Large files (>5MB) automatically use chunked processing
- **Ornament Recognition**: Some complex ornaments (e.g., baroque trills) may not be fully recognized
- **Modern Notation**: Extended techniques (harmonics, multiphonics) may not be handled
- **Performance**: First-time model loading takes ~5 seconds (cached afterwards)

## Browser Compatibility

| Browser | Minimum Version | Notes |
|---------|----------------|-------|
| Chrome | 90+ | Recommended, best performance |
| Firefox | 88+ | Full support |
| Safari | 14+ | WebGL required |
| Edge | 90+ | Chromium-based, full support |

## Contributing

Contributions are welcome! Please follow these guidelines:
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Citation

If you use this project in academic research, please cite:

```
@software{music_score_simplifier,
  title = {Music Score Simplifier: AI-Assisted Graded Simplification for Music Education},
  author = {[Your Name]},
  year = {2025},
  url = {https://github.com/[your-username]/music-score-simplifier}
}
```

## License

MIT License - see LICENSE file for details

## Acknowledgments

- **Magenta.js Team**: For the MusicVAE model
- **TensorFlow.js Team**: For the inference engine
- **ml-js Community**: For machine learning algorithms
- **MuseScore**: For MusicXML format support
