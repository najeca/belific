// The "Add a task" box (3.16.0): what fits in it. The field keeps at least INPUT_MIN wide while it is empty (the whole
// placeholder, "Add a task", is 71 px at 14 px; 76 leaves a little to spare); once something is typed the placeholder
// is gone and 48 is enough. As the box narrows the secondary controls go away, never the text, in this order of
// what stays longest:
//   empty box:  the label button, the total of the day (a day column), then the details icon
//   typing:     the label button (2.27.0: it is never pushed out), the time picker (a day column), the details icon,
//               then the estimate picker (the estimate can also be set in the details)
// Before the box has been measured everything is shown.
export const INPUT_MIN = 76;
export const TYPING_MIN = 48;
const BASE = 41; // the padding (10 + 6), the + (22, 3 tucked in) and the gap before the field
const BTN = 34; // a 28 point button and its gap
export const NEEDS_TITLE = 'Type a name first, then open the details.';

export interface AddRoom {
  details: boolean;
  label: boolean;
  trailing: boolean;
  time: boolean;
  estimate: boolean;
}

export interface AddWants {
  typing: boolean;
  time: boolean; // the time picker is wanted (a day column, with a title typed or a time set)
  estimate: boolean; // the estimate picker is wanted
  trailing: boolean; // the total of the day is wanted (nothing typed or chosen yet)
}

export function addRoom(width: number | null, wants: AddWants): AddRoom {
  if (width === null) return { details: true, label: true, trailing: wants.trailing, time: wants.time, estimate: wants.estimate };
  let left = width - BASE - (wants.typing ? TYPING_MIN : INPUT_MIN);
  const take = (cost: number, wanted: boolean): boolean => {
    if (!wanted || left < cost) return false;
    left -= cost;
    return true;
  };
  if (!wants.typing) {
    const label = take(BTN, true);
    const trailing = take(86, wants.trailing);
    const details = take(BTN, true);
    return { details, label, trailing, time: false, estimate: false };
  }
  const label = take(BTN, true);
  const time = take(90, wants.time);
  const details = take(BTN, true);
  const estimate = take(56, wants.estimate);
  return { details, label, trailing: false, time, estimate };
}
