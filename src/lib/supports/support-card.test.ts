import { expect, it } from 'vitest';
import { matchesSupportSearch, normalizeSupportCards, releasedSupportCards, supportCardDisplay, supportTypeName } from './support-card';

it('preserves Angular title aliases, search normalization, release flags and newest-first ordering', () => {
  const raw = [
    {id:2,name:'Raw',character_name:'Kitasan Black',support_card_full_name:'[Fire at My Heels] Kitasan Black',type:'speed',rarity:3,release_date:'2026-01-01',isReleased_en:true},
    {id:3,name:'Fine Motion',cardTitle:'Wave of Gratitude',type:'wisdom',rarity:3,release_date:'2026-01-01',isReleased_en:true},
    {id:4,name:'Unreleased',type:'group',rarity:3,release_date:'2026-02-01',isReleased_en:false},
    {id:5,name:'No release flag',type:'guts',rarity:1,release_date:'2026-03-01'},
  ];
  const cards = normalizeSupportCards({default:Object.fromEntries(raw.map(card => [card.id,card]))});
  expect(releasedSupportCards(cards).map(card => card.id)).toEqual(['3','2']);
  const display = supportCardDisplay(cards[0]!);
  expect(display).toMatchObject({title:'[Fire at My Heels]',character:'Kitasan Black'});
  for (const query of ['BLACK, FIRE','Kitasan-Heels','2']) expect(matchesSupportSearch(display.searchText,query)).toBe(true);
  expect(matchesSupportSearch(display.searchText,'Kitasan Grass')).toBe(false);
  expect(supportCardDisplay(cards[1]!).title).toBe('[Wave of Gratitude]');
  expect(['intelligence','wisdom','group','unknown'].map(supportTypeName)).toEqual(['Wit','Wit','Friend','Speed']);
  expect(() => normalizeSupportCards({error:'Unavailable'})).toThrow('Invalid support-card record');
});
