import type { Card, TeamMatcher } from '../../../hakuraku-types';
import { styleNames, styleOrder } from '../../cm-data';
import { portrait } from '../../../analysis-view';

type Cards = Record<number, Card>;

export function selectionMatcher(cards: Cards, uma: string, style: string): TeamMatcher {
  return {
    ...(uma.startsWith('chara:')
      ? { chara: Number(uma.slice(6)) }
      : uma
        ? { card: Number(uma), chara: cards[Number(uma)]?.chara }
        : {}),
    ...(style ? { style: Number(style) } : {})
  };
}

export function matcherValue(matcher: TeamMatcher) {
  return matcher.card ? String(matcher.card) : matcher.chara ? 'chara:' + matcher.chara : '';
}

export function matcherCard(cards: Cards, matcher: TeamMatcher) {
  return matcher.card
    ? cards[matcher.card]
    : Object.values(cards).find((card) => card.chara === matcher.chara);
}

export function charaCardId(cards: Cards, chara?: number) {
  return Number(Object.keys(cards).find((id) => cards[Number(id)]?.chara === chara));
}

export function matcherLabel(cards: Cards, matcher: TeamMatcher): string {
  const card = matcherCard(cards, matcher);
  return [
    card ? card.name + ' (' + (matcher.card ? card.outfit : 'any outfit') + ')' : 'Any Uma',
    matcher.style ? styleNames[matcher.style] : undefined
  ]
    .filter(Boolean)
    .join(' + ');
}

export function sameMatcher(a: TeamMatcher, b: TeamMatcher) {
  return a.card === b.card && a.chara === b.chara && a.style === b.style;
}

export function runnerChoices(cards: Cards) {
  return [
    { value: '', label: 'Any Uma' },
    ...Object.values(cards)
      .filter(
        (card, index, values) => values.findIndex((other) => other.chara === card.chara) === index
      )
      .sort((a, b) => a.name.localeCompare(b.name))
      .flatMap((character) => [
        {
          value: 'chara:' + character.chara,
          label: character.name + ' (any outfit)',
          image: portrait(charaCardId(cards, character.chara)),
          keywords: String(character.chara)
        },
        ...Object.entries(cards)
          .filter(([, card]) => card.chara === character.chara)
          .sort((a, b) => a[1].outfit.localeCompare(b[1].outfit))
          .map(([id, card]) => ({
            value: id,
            label: card.name + ' (' + card.outfit + ')',
            image: portrait(Number(id)),
            keywords: id
          }))
      ])
  ];
}

export const styleChoices = [
  { value: '', label: 'Any style' },
  ...styleOrder.map((id) => ({ value: String(id), label: styleNames[id]! }))
];
