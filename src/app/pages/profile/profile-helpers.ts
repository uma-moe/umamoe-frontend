import { getCharacterById } from '../../data/character.data';
import { getSkillBySkillId, hasInheritedFlag, hasUniqueFlag } from '../../data/skills.data';

export function getAptIcon(val: number | null): string {
    const idx = val != null && val >= 1 ? (val * 2 - 1).toString().padStart(2, '0') : '01';
    return `assets/images/icon/statusrank/utx_ico_statusrank_${idx}.webp`;
}

export function getAptGrade(val: number | null): string {
    if (val == null || val < 1) return 'G';
    const grades = ['G', 'F', 'E', 'D', 'C', 'B', 'A', 'S'];
    return grades[Math.min(val - 1, 7)];
}

export function getRankIcon(score: number | null): string | null {
    if (score == null) return null;
    const thresholds = [0,300,600,900,1300,1800,2300,2900,3500,4900,6500,8200,10000,12100,14500,15900,17500,19200,19600,20000,20400,20800,21200,21600];
    let index = 0;
    if (score < 22100) {
        for (let i = thresholds.length - 1; i >= 0; i--) {
            if (score >= thresholds[i]) { index = i; break; }
        }
    } else {
        index = 24 + Math.floor((score - 22100) / 400);
    }
    if (index > 97) index = 97;
    return `assets/images/icon/ranks/utx_txt_rank_${index.toString().padStart(2, '0')}.webp`;
}

export function getRankGrade(score: number | null): string {
    if (score == null) return '';
    if (score >= 12000) return 'A+';
    if (score >= 10000) return 'A';
    if (score >= 9000) return 'B+';
    if (score >= 7000) return 'B';
    if (score >= 5500) return 'C';
    if (score >= 4000) return 'D';
    if (score >= 3000) return 'E';
    if (score >= 2000) return 'F';
    return 'G';
}

export function getRankGradeColor(score: number | null): string {
    if (score == null) return 'rgba(255,255,255,0.3)';
    if (score >= 12000) return '#ffd700';
    if (score >= 10000) return '#81c784';
    if (score >= 9000) return '#64b5f6';
    if (score >= 7000) return '#90caf9';
    if (score >= 5500) return '#ffb74d';
    if (score >= 4000) return '#e57373';
    return 'rgba(255,255,255,0.4)';
}

export function getStarDisplay(rarity: number | null): { filled: boolean; talent: boolean }[] {
    const r = Math.min(rarity ?? 0, 5);
    return Array.from({ length: 5 }, (_, i) => ({ filled: i < r, talent: false }));
}

export function getDistanceName(type: number | null): string {
    if (type == null) return '-';
    const names: Record<number, string> = { 1: 'Sprint', 2: 'Mile', 3: 'Middle', 4: 'Long', 5: 'Dirt' };
    return names[type] || `Dist ${type}`;
}

export function getRunningStyleName(style: number | null): string {
    if (style == null) return '-';
    const names: Record<number, string> = { 1: 'Runner', 2: 'Leader', 3: 'Betweener', 4: 'Chaser' };
    return names[style] || `Style ${style}`;
}

export function getScenarioName(id: number | null): string {
    if (id == null) return '-';
    const names: Record<number, string> = { 1: 'URA', 2: 'Aoharu', 3: 'MANT', 4: 'MANT', 5: 'LArc', 6: 'Grand Challenge', 7: 'U.A.F.' };
    return names[id] || `Scenario ${id}`;
}

export function getTotalStats(m: any): number {
    return (m.speed || 0) + (m.stamina || 0) + (m.power || 0) + (m.guts || 0) + (m.wiz || 0);
}

export function getCardImage(cardId: number | null): string | null {
    if (!cardId) return null;
    return `assets/images/character_stand/chara_stand_${cardId}.webp`;
}

export function getCharacterName(cardId: number | null): string {
    if (!cardId) return 'Unknown';
    const char = getCharacterById(cardId);
    return char?.name || `Character ${cardId}`;
}

function findSkill(skillId: number): { skill: ReturnType<typeof getSkillBySkillId>; inherited: boolean } {
    let result: { skill: ReturnType<typeof getSkillBySkillId>; inherited: boolean };
    let skill = getSkillBySkillId(skillId);
    if (skill) { result = { skill, inherited: hasInheritedFlag(skill) }; }
    else {
        const baseId = Math.floor(skillId / 10);
        skill = getSkillBySkillId(baseId);
        if (skill) { result = { skill, inherited: hasInheritedFlag(skill) }; }
        else {
            const baseIdStr = String(baseId);
            if (baseIdStr.startsWith('9')) {
                const rest = baseIdStr.substring(1);
                let found = false;
                for (const prefix of ['1', '2', '3']) {
                    skill = getSkillBySkillId(Number(prefix + rest));
                    if (skill) { result = { skill, inherited: true }; found = true; break; }
                }
                if (!found) result = { skill: undefined, inherited: false };
            } else {
                result = { skill: undefined, inherited: false };
            }
        }
    }
    return result!;
}

export function getSkillName(skillId: number): string {
    const { skill } = findSkill(skillId);
    if (!skill) return `Skill ${skillId}`;
    return skill.name;
}

export function getSkillLevel(skillId: number): number {
    const lastDigit = skillId % 10;
    return lastDigit > 0 ? lastDigit : 1;
}

export function getSkillIcon(skillId: number): string | null {
    const { skill } = findSkill(skillId);
    return skill?.icon ? `assets/images/skills/${skill.icon}` : null;
}

export function getSkillRarityClass(skillId: number): string {
    const { skill, inherited } = findSkill(skillId);
    if (!skill) return '';
    if (hasUniqueFlag(skill) || skill.rarity === 4) return inherited ? 'rarity-unique-inherited' : 'rarity-gold rarity-unique-main';
    if (skill.rarity === 3) return 'rarity-special';
    if (skill.rarity === 2) return 'rarity-gold';
    return '';
}

function getSkillText(skill: NonNullable<ReturnType<typeof getSkillBySkillId>>): string {
    return [skill.name, skill.effect, skill.description, skill.conditions, skill.icon].join(' ').toLowerCase();
}

function getSkillTypeRank(skill: NonNullable<ReturnType<typeof getSkillBySkillId>>): number {
    const text = getSkillText(skill);
    if (/speed down|decrease(?:s|d)? .*speed|lower(?:s|ed)? .*speed|slow(?:s|ed)?|hesitat|intimidat|disorient|drain|debuff|fatigue.*(?:opponent|enemy|rival)|(?:opponent|enemy|rival).*fatigue/.test(text)) return 2;
    if (/stamina recovery|recover(?:s|ed)? stamina|recover endurance|restore(?:s|d)? stamina|regain|decrease fatigue|reduce fatigue|harder to tire/.test(text)) return 1;
    if (/speed|velocity|target speed|current speed/.test(text)) return 0;
    return 3;
}

function getSkillSortBucket(skillId: number): number {
    const { skill, inherited } = findSkill(skillId);
    if (!skill) return 99;

    if (hasUniqueFlag(skill)) return inherited ? 1 : 0;

    const typeRank = getSkillTypeRank(skill);
    if (skill.rarity === 2 || skill.rarity === 4) return 2 + typeRank;
    return 6 + typeRank;
}

export function sortEncodedSkills(skillIds: number[]): number[] {
    return skillIds
        .map((skillId, index) => ({ skillId, index }))
        .sort((a, b) => {
            const bucketDiff = getSkillSortBucket(a.skillId) - getSkillSortBucket(b.skillId);
            return bucketDiff !== 0 ? bucketDiff : a.index - b.index;
        })
        .map(entry => entry.skillId);
}
