import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Colors } from '../../lib/theme';
import { createFromTemplate, loadTemplates } from '../../lib/templateActions';
import type { TaskTemplate } from '../../lib/templates';
import Popover, { closePopover, Row, togglePopover, useIsOpen, usePopoverAnchor } from './Popover';

// "New from template" beside the Brain Dump capture (build plan phase 7, shown
// only while the Templates feature is on). A new task made from a template lands
// in the list that is showing, unticked and with no Day.
const POPOVER_ID = 'template-picker';

export default function TemplatePicker({ listKey, refreshKey, onChanged }: { listKey: string | undefined; refreshKey: number; onChanged: () => void }) {
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const { ref, get } = usePopoverAnchor();
  const open = useIsOpen(POPOVER_ID);
  useEffect(() => {
    loadTemplates().then(setTemplates).catch(() => {});
  }, [refreshKey, open]);

  async function pick(t: TaskTemplate) {
    closePopover(true);
    await createFromTemplate(t, { listKey });
    onChanged();
  }

  return (
    <>
      <Pressable
        ref={ref as never}
        onPress={() => togglePopover(POPOVER_ID, get)}
        style={[styles.btn, open && styles.btnOpen]}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel="New from template"
      >
        <Text style={styles.emoji}>📑</Text>
      </Pressable>
      <Popover id={POPOVER_ID} anchor={get} width={260} label="Task templates">
        <View style={{ paddingVertical: 6 }}>
          {templates.length === 0 ? (
            <Text style={styles.empty}>No templates yet. Open a task and choose "Save as template".</Text>
          ) : (
            templates.map((t) => (
              <Row key={t.id} label={`${t.emoji ?? '📑'} ${t.name}`} a11y={`Template ${t.name}`} onPress={() => pick(t)} />
            ))
          )}
        </View>
      </Popover>
    </>
  );
}

const styles = StyleSheet.create({
  btn: { width: 40, height: 40, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center' },
  btnOpen: { borderColor: Colors.accent },
  emoji: { fontSize: 16 },
  empty: { fontSize: 12, color: Colors.textSecondary, paddingHorizontal: 14, paddingVertical: 8 },
});
