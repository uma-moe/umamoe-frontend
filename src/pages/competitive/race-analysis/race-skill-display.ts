import { skillImage, type SkillData } from '@/lib/game-data/skills/skills';
import type { ParsedRaceCapture } from '@/lib/race/capture/race-capture-parser';

export function skillName(skillId: number, skills: Map<number, SkillData>): string {
  return skills.get(skillId)?.name ?? `Skill ${skillId}`;
}

export function skillEffect(skillId: number, skills: Map<number, SkillData>): string {
  return skills.get(skillId)?.effect || skills.get(skillId)?.description || 'See skill details';
}

export function skillIcon(skillId: number, skills: Map<number, SkillData>): string | undefined {
  const icon = skills.get(skillId)?.icon;
  return skillImage(icon);
}

export function activatedSkills(
  capture: ParsedRaceCapture,
  runnerIndex: number,
  skills: Map<number, SkillData>
) {
  return capture.events
    .filter((event) => event.type === 3 && event.params[0] === runnerIndex)
    .map((event) => ({
      frame: event.frameTime.toFixed(2),
      skill: skillName(event.params[1] ?? 0, skills),
      phase: `${Math.round(capture.frames.find((frame) => frame.time >= event.frameTime)?.horses[runnerIndex]?.distance ?? 0)}m`,
      effect: skillEffect(event.params[1] ?? 0, skills)
    }));
}
