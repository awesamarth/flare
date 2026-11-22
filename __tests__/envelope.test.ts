import {
  decodeDirect,
  decodeGroup,
  encodeDirect,
  encodeGroup,
} from '../src/protocol/envelope';
import { buildGroupLink, buildPersonLink, parseLink } from '../src/protocol/links';
import { bearingDeg, distanceMeters } from '../src/lib/geo';

describe('envelope', () => {
  it('round-trips group payloads', () => {
    const loc = { k: 'loc' as const, lat: 19.07, lon: 72.87, acc: 8, ts: 1000 };
    expect(decodeGroup(encodeGroup(loc))).toEqual(loc);
    const chat = { k: 'chat' as const, id: 'a1', text: 'hi', ts: 5 };
    expect(decodeGroup(encodeGroup(chat))).toEqual(chat);
  });

  it('keeps scopes apart', () => {
    const chat = { k: 'chat' as const, id: 'a1', text: 'hi', ts: 5 };
    expect(decodeDirect(encodeGroup(chat))).toBeNull();
    expect(decodeGroup(encodeDirect(chat))).toBeNull();
  });

  it('rejects malformed input', () => {
    expect(decodeGroup('{"v":1,"s":"g","k":"loc","lat":200,"lon":0,"acc":1,"ts":1}')).toBeNull();
    expect(decodeGroup('{"v":1,"s":"g","k":"profile","name":"x","color":"red","ts":1}')).toBeNull();
    expect(decodeGroup('not json')).toBeNull();
    expect(decodeGroup('{"v":2,"s":"g","k":"chat","id":"a","text":"b","ts":1}')).toBeNull();
  });

  it('treats plain direct text as chat', () => {
    expect(decodeDirect('hello')).toMatchObject({ k: 'chat', text: 'hello' });
  });
});

describe('links', () => {
  it('round-trips group and person links', () => {
    const group = buildGroupLink('grp-1', 'Sunburn & co', 'abc_DEF-123');
    expect(parseLink(group)).toEqual({
      type: 'group',
      groupId: 'grp-1',
      groupName: 'Sunburn & co',
      invite: 'abc_DEF-123',
    });
    expect(parseLink(buildPersonLink('xyz'))).toEqual({ type: 'person', invite: 'xyz' });
  });

  it('ignores foreign codes', () => {
    expect(parseLink('https://example.com')).toBeNull();
    expect(parseLink('flare://join?g=x')).toBeNull();
  });
});

describe('geo', () => {
  it('computes distance and bearing', () => {
    const a = { lat: 0, lon: 0 };
    const north = { lat: 0.001, lon: 0 };
    const east = { lat: 0, lon: 0.001 };
    expect(distanceMeters(a, north)).toBeCloseTo(111.2, 0);
    expect(bearingDeg(a, north)).toBeCloseTo(0, 3);
    expect(bearingDeg(a, east)).toBeCloseTo(90, 3);
  });
});
