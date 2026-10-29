import test from 'node:test';
import assert from 'node:assert/strict';
import { INPUT_MIN, addRoom, type AddWants } from './addBox.ts';

const empty: AddWants = { typing: false, time: false, estimate: false, trailing: true };
const typedDay: AddWants = { typing: true, time: true, estimate: true, trailing: false };
const typedLeft: AddWants = { typing: true, time: false, estimate: true, trailing: false };

test('3.16.0: the Add box shows everything before it is measured', () => {
  assert.deepEqual(addRoom(null, empty), { details: true, label: true, trailing: true, time: false, estimate: false });
  assert.deepEqual(addRoom(null, typedDay), { details: true, label: true, trailing: false, time: true, estimate: true });
});

test('3.16.0: the left pane box (about 222 wide, no total) holds the label and the details icon, with the field whole', () => {
  assert.deepEqual(addRoom(222, { typing: false, time: false, estimate: false, trailing: false }), { details: true, label: true, trailing: false, time: false, estimate: false });
  assert.deepEqual(addRoom(222, typedLeft), { details: true, label: true, trailing: false, time: false, estimate: true }, 'the left pane keeps the estimate while typing too');
});

test('3.16.0: a day column (272) keeps its total, its label and the details icon; typing keeps the label, the time and the details icon', () => {
  assert.deepEqual(addRoom(272, empty), { details: true, label: true, trailing: true, time: false, estimate: false });
  const typing = addRoom(272, typedDay);
  assert.equal(typing.label && typing.time && typing.details, true);
  assert.equal(typing.estimate, false, 'the estimate gives way first (it is in the details too)');
});

test('3.16.0: as the box narrows the details icon goes before the label, the field never gets less than its placeholder', () => {
  assert.deepEqual(addRoom(180, { typing: false, time: false, estimate: false, trailing: false }), { details: false, label: true, trailing: false, time: false, estimate: false });
  assert.equal(addRoom(130, empty).label, false, 'only + and the field are left at the narrowest');
  for (const w of [0, 100, 117, 118, 150, 173, 174, 206, 222, 272, 400, 1000]) {
    for (const wants of [empty, typedDay, typedLeft]) {
      const r = addRoom(w, wants);
      const min = wants.typing ? 48 : INPUT_MIN;
      const used = 41 + min + (r.details ? 34 : 0) + (r.label ? 34 : 0) + (r.estimate ? 56 : 0) + (r.time ? 90 : 0) + (r.trailing ? 86 : 0);
      if (w >= 41 + min) assert.ok(used <= w, `width ${w} ${JSON.stringify(wants)}: ${used}`);
    }
  }
});
