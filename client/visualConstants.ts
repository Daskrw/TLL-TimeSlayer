// ============================================================
//  Visual Constants — shared across all client modules
// ============================================================

// ─── Board geometry (world units) ────────────────────────────
export const LANE_COUNT      = 4;
export const LANE_WIDTH      = 3.0;
export const LANE_HALF_LEN   = 6.0;   // half total board depth
export const BOARD_HALF_W    = LANE_COUNT * LANE_WIDTH * 0.5;   // 6

// Lane X centers (left → right)
export const LANE_X: Readonly<[number,number,number,number]> = [-4.5, -1.5, 1.5, 4.5];

// Slot Z positions (Frontline is closer to midline; Support is backline)
export const PLAYER_FRONTLINE_Z =  2.1;
export const PLAYER_SUPPORT_Z   =  4.6;
export const OPP_FRONTLINE_Z    = -2.1;
export const OPP_SUPPORT_Z      = -4.6;

// Legacy fallback
export const PLAYER_SLOT_Z   = PLAYER_FRONTLINE_Z;
export const OPP_SLOT_Z      = OPP_FRONTLINE_Z;

export const PLAYER_HERO_X   =  7.0;
export const PLAYER_HERO_Z   =  5.8;
export const OPP_HERO_Z      = -6.5;
export const HAND_Z          =  7.4;
export const HAND_Y          =  1.35;

// ─── Card geometry ────────────────────────────────────────────
export const CARD_W          = 1.75;
export const CARD_H          = 2.45;
export const CARD_DEPTH      = 0.018;
export const CARD_HOVER_LIFT = 0.75;
export const CARD_HOVER_SCALE= 1.30;

// ─── Lane colors (hex int) ────────────────────────────────────
export const LANE_COLOR: Readonly<[number,number,number,number]> = [
  0x153555,  // 0 Aerial  – elevated sky platform tint
  0x1a3d1a,  // 1 Ground1 – lush grass/stone terrain
  0x1e4520,  // 2 Ground2 – slightly lighter stone/grass
  0x0b254d,  // 3 Water   – deep blue translucent water
];

export const LANE_EMISSIVE: Readonly<[number,number,number,number]> = [
  0x205580,
  0x163616,
  0x1c3e1c,
  0x0a2a50,
];

// ─── Tribe palette (for card borders / art tints) ─────────────
export const TRIBE_HEX: Record<string, number> = {
  ปัญญา:       0x38bdf8, // Sky Blue / Cyan (Wisdom)
  จอมพล:       0xf59e0b, // Gold / Amber (Warlord)
  จู่โจม:       0xef4444, // Crimson Red (Assault)
  รักษา:       0x10b981, // Emerald Green (Restoration)
  พิทักษ์:     0x64748b, // Slate / Shield Gray (Guardian)
  ยุทธศาสตร์:   0x8b5cf6, // Violet / Purple (Strategy)
  จอมอาคม:     0xd946ef, // Arcane Magenta (Sorcerer)
  เป็นกลาง:    0x94a3b8, // Neutral Gray / Silver
  // System / Fallback
  Superpower: 0xffaa00,
  Neutral:    0x94a3b8,
  Plant:      0x10b981,
  Zombie:     0x8b5cf6,
  Aerial:     0x38bdf8,
  Vanguard:   0xf59e0b,
  Aquatic:    0x06b6d4,
  Tempo:      0xef4444,
  Control:    0x38bdf8,
  Sorcery:    0xd946ef,
  Amphibian:  0x06b6d4,
};

export const TRIBE_CSS: Record<string, string> = {
  ปัญญา:       "#38bdf8",
  จอมพล:       "#f59e0b",
  จู่โจม:       "#ef4444",
  รักษา:       "#10b981",
  พิทักษ์:     "#64748b",
  ยุทธศาสตร์:   "#8b5cf6",
  จอมอาคม:     "#d946ef",
  เป็นกลาง:    "#94a3b8",
  // System / Fallback
  Superpower: "#ffaa00",
  Neutral:    "#94a3b8",
  Plant:      "#10b981",
  Zombie:     "#8b5cf6",
  Aerial:     "#38bdf8",
  Vanguard:   "#f59e0b",
  Aquatic:    "#06b6d4",
  Tempo:      "#ef4444",
  Control:    "#38bdf8",
  Sorcery:    "#d946ef",
  Amphibian:  "#06b6d4",
  default:    "#94a3b8",
};

// ─── Highlight colors ─────────────────────────────────────────
export const COLOR_VALID_SLOT   = 0x00ff88;
export const COLOR_INVALID_SLOT = 0xff3333;
export const COLOR_CARD_ATTACK  = 0xff8822;
export const COLOR_CARD_DEATH   = 0x440000;
export const COLOR_STRIKETHROUGH= 0x00ffff;

// ─── Hero display ─────────────────────────────────────────────
export const HERO_AVATAR_R      = 0.9;   // radius of avatar disc
export const HERO_HP_BAR_W      = 3.2;
export const HERO_HP_BAR_H      = 0.28;
export const BLOCK_SEG_W        = 0.28;
export const BLOCK_SEG_H        = 0.18;
export const BLOCK_SEG_GAP      = 0.05;
export const BLOCK_SEGMENTS     = 8;

// ─── Camera (55 degrees pitch downward) ───────────────────────
export const CAM_ANGLE_DEG  = 55;
export const CAM_POS_X      = 0;
export const CAM_POS_Y      = 15.5; // tan(55°) = 1.4281 -> 15.5 / 10.85 = 1.4285
export const CAM_POS_Z      = 10.85;
export const CAM_TARGET_X   = 0;
export const CAM_TARGET_Y   = 0;
export const CAM_TARGET_Z   = 0;
export const CAM_FOV        = 52;

// ─── Slot visual markers ──────────────────────────────────────
export const SLOT_MARKER_R   = 0.7;
export const SLOT_MARKER_OPACITY = 0.35;

// ─── Animation timing (seconds) ───────────────────────────────
export const ANIM_ATTACK_SLIDE  = 0.22;
export const ANIM_RETURN_SLIDE  = 0.18;
export const ANIM_SHAKE_DIST    = 0.12;
export const ANIM_SHAKE_DUR     = 0.06;
export const ANIM_DEATH_DUR     = 0.55;
export const ANIM_INTER_LANE    = 0.3;    // pause between lane combats
export const ANIM_HP_COUNT_DUR  = 0.4;
export const ANIM_BLOCK_FILL    = 0.25;
export const ANIM_SHIELD_BURST  = 0.7;
export const ANIM_HAND_RETURN   = 0.35;
export const ANIM_CARD_PLAY     = 0.45;

// ─── Z layering on board ──────────────────────────────────────
export const Z_TABLE      = -0.01;
export const Z_LANE       =  0.0;
export const Z_SLOT       =  0.02;
export const Z_UNIT       =  0.06;
export const Z_DRAGGING   =  1.6;
