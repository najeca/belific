import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, Switch, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../lib/theme';
import { labelColor } from '../../lib/labelColors';
import { normalizeName } from '../../lib/labelRules';
import { EMPTY_FILTER, filterCount, toggleLabel, type TaskFilter } from '../../lib/taskFilter';
import type { Project } from '../../lib/types';
import Popover, { Row, togglePopover, useIsOpen, usePopoverAnchor } from './Popover';

// The board filter (checkpoint 8.2, decision 021), top right of the week
// header. Multi select labels, a "No label" row and a "Show complete" switch;
// the button shows how many are on. It filters tasks only, never events.
export default function FilterButton({
  filter,
  labels,
  onChange,
}: {
  filter: TaskFilter;
  labels: Project[];
  onChange: (next: TaskFilter) => void;
}) {
  const { ref, get } = usePopoverAnchor();
  const open = useIsOpen('filter');
  const count = filterCount(filter);
  const text = count > 0 ? `Filter (${count})` : 'Filter';
  return (
    <>
      <Pressable
        ref={ref as never}
        onPress={() => togglePopover('filter', get)}
        style={[styles.btn, count > 0 && styles.btnOn, open && styles.btnOpen]}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={text}
      >
        <Ionicons name="funnel-outline" size={14} color={count > 0 ? Colors.accentText : Colors.textSecondary} />
        <Text style={[styles.text, count > 0 && styles.textOn]}>{text}</Text>
      </Pressable>
      <Popover id="filter" anchor={get} width={272}>
        <FilterBody filter={filter} labels={labels} onChange={onChange} />
      </Popover>
    </>
  );
}

function FilterBody({ filter, labels, onChange }: { filter: TaskFilter; labels: Project[]; onChange: (next: TaskFilter) => void }) {
  const [text, setText] = useState('');
  const query = normalizeName(text);
  const shown = query ? labels.filter((l) => normalizeName(l.name).includes(query)) : labels;
  const count = filterCount(filter);
  return (
    <View style={styles.body}>
      <View style={styles.searchWrap}>
        <TextInput
          style={styles.search}
          placeholder="Search labels"
          placeholderTextColor={Colors.textSecondary}
          value={text}
          onChangeText={setText}
          accessibilityLabel="Search filter labels"
          autoFocus
        />
      </View>
      {shown.map((l) => {
        const on = filter.labels.includes(l.key);
        return (
          <Row
            key={l.key}
            label={l.name}
            selected={on}
            a11y={`Filter label ${l.name}`}
            leading={<View style={[styles.dot, { backgroundColor: labelColor(l.colorKey)?.edge ?? Colors.border }]} />}
            onPress={() => onChange(toggleLabel(filter, l.key))}
          />
        );
      })}
      {(!query || 'no label'.includes(query)) && (
        <Row
          label="No label"
          selected={filter.noLabel}
          a11y="Filter no label"
          leading={<View style={[styles.dot, styles.dotEmpty]} />}
          onPress={() => onChange({ ...filter, noLabel: !filter.noLabel })}
        />
      )}
      <View style={styles.switchRow}>
        <Text style={styles.switchText}>Show complete</Text>
        <Switch
          value={filter.showComplete}
          onValueChange={(v) => onChange({ ...filter, showComplete: v })}
          trackColor={{ false: Colors.border, true: Colors.accent }}
          thumbColor={Colors.surface}
          accessibilityLabel="Show complete"
        />
      </View>
      <Pressable
        onPress={() => onChange(EMPTY_FILTER)}
        disabled={count === 0}
        style={[styles.clear, count === 0 && styles.disabled]}
        accessibilityRole="button"
        accessibilityLabel="Clear filter"
      >
        <Text style={styles.clearText}>Clear</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  btn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 36, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background },
  btnOn: { borderColor: Colors.accent },
  btnOpen: { backgroundColor: Colors.surface },
  text: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  textOn: { color: Colors.accentText },
  body: { paddingBottom: 6 },
  searchWrap: { padding: 10, paddingBottom: 4 },
  search: {
    height: 34,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
    color: Colors.textPrimary,
    fontSize: 14,
    outlineColor: Colors.accent,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  dotEmpty: { backgroundColor: 'transparent', borderWidth: 1, borderColor: Colors.textSecondary },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, minHeight: 40, marginTop: 4, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border },
  switchText: { fontSize: 14, color: Colors.textPrimary },
  clear: { paddingHorizontal: 12, minHeight: 32, justifyContent: 'center' },
  clearText: { fontSize: 13, fontWeight: '600', color: Colors.accentText },
  disabled: { opacity: 0.4 },
});
