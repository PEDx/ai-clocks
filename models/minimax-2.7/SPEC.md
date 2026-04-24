# Mechanical Clock — Canvas Specification

## Project Overview
- **Type**: Single HTML file, interactive canvas visualization
- **Functionality**: Real-time analog mechanical clock with realistic styling
- **Target Users**: General audience, browser-based

## Visual & Rendering Specification

### Scene Setup
- Canvas centered on page, dark background
- Clock face: circular, ivory/cream color with subtle texture
- Outer bezel: metallic ring with tick marks and Roman numerals
- Three hands: hour, minute, second (second hand animated continuously)

### Materials & Effects
- **Clock face**: Warm ivory (#F5F0E6) with subtle radial gradient
- **Bezel**: Metallic brass/gold gradient (#B8860B, #FFD700, #DAA520)
- **Tick marks**: 12 major (hour), 60 minor (minute)
- **Numerals**: Roman numerals (I–XII), dark brown/black
- **Hands**: Dark steel/gunmetal with metallic sheen, second hand red accent
- **Center cap**: Brass colored circle with 3D shading
- **Shadow**: Drop shadow under bezel, subtle shadow under hands

### Visual Style
- Vintage/steampunk mechanical aesthetic
- High contrast, warm tones with metallic accents
- Smooth second-hand sweep (not ticking)

## Interaction Specification
- **Real-time**: Clock reads system time, updates every ~16ms (60fps)
- **No user interaction needed**: Self-running

## Acceptance Criteria
1. Clock face renders correctly with numerals and tick marks
2. Hour hand moves smoothly (12-hour cycle)
3. Minute hand moves smoothly (60-minute cycle)
4. Second hand sweeps continuously (not discrete ticks)
5. All hands are centered and rotate from clock center
6. Page loads instantly, no external dependencies
7. Responsive: works on various screen sizes