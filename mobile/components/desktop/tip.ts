// A hover tooltip on a react-native-web element. react-native-web drops a `title`
// prop, so it is written onto the DOM node through a ref (desktop only).
export const tipRef = (text?: string) => (node: unknown) => {
  const el = node as HTMLElement | null;
  if (!el || typeof el.setAttribute !== 'function') return;
  if (text) el.setAttribute('title', text);
  else el.removeAttribute('title');
};
