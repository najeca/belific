import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { Colors } from '../../lib/theme';
import { deleteTemplate, loadTemplates, renameTemplate } from '../../lib/templateActions';
import type { TaskTemplate } from '../../lib/templates';

// Manage the saved task templates (Settings, shown when the Templates feature is
// on): rename or delete. Templates are made from a task (its details panel).
export default function TemplatesManager() {
  const [templates, setTemplates] = useState<TaskTemplate[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [confirming, setConfirming] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setTemplates(await loadTemplates());
    } catch {
      setTemplates([]);
    }
  }, []);
  useEffect(() => {
    reload();
  }, [reload]);

  async function saveName(id: string) {
    if (name.trim()) await renameTemplate(id, name);
    setEditing(null);
    await reload();
  }

  if (!templates) return null;
  return (
    <View style={styles.wrap} accessibilityLabel="Task templates">
      {templates.length === 0 ? (
        <Text style={styles.hint}>No templates yet. Open a task and choose "Save as template".</Text>
      ) : (
        templates.map((t) => (
          <View key={t.id} style={styles.item} accessibilityLabel={`Template ${t.name}`}>
            <View style={styles.row}>
              <Text style={styles.emoji}>{t.emoji ?? '📑'}</Text>
              {editing === t.id ? (
                <TextInput
                  style={styles.input}
                  value={name}
                  onChangeText={setName}
                  onSubmitEditing={() => saveName(t.id)}
                  onBlur={() => saveName(t.id)}
                  autoFocus
                  selectTextOnFocus
                  maxLength={40}
                  accessibilityLabel={`Rename template ${t.name}`}
                />
              ) : (
                <Pressable
                  style={{ flex: 1 }}
                  onPress={() => {
                    setEditing(t.id);
                    setName(t.name);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Rename template ${t.name}`}
                >
                  <Text style={styles.name} numberOfLines={1}>{t.name}</Text>
                </Pressable>
              )}
              <Pressable onPress={() => setConfirming(confirming === t.id ? null : t.id)} accessibilityRole="button" accessibilityLabel={`Delete template ${t.name}`} style={styles.btn}>
                <Text style={styles.btnText}>Delete</Text>
              </Pressable>
            </View>
            {confirming === t.id && (
              <View style={styles.row}>
                <Text style={[styles.hint, { flex: 1 }]}>Delete the template {t.name}? Tasks already made from it stay.</Text>
                <Pressable
                  onPress={async () => {
                    await deleteTemplate(t.id);
                    setConfirming(null);
                    await reload();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Confirm delete template ${t.name}`}
                  style={styles.btn}
                >
                  <Text style={styles.danger}>Delete</Text>
                </Pressable>
                <Pressable onPress={() => setConfirming(null)} accessibilityRole="button" accessibilityLabel="Cancel delete template" style={styles.btn}>
                  <Text style={styles.btnText}>Cancel</Text>
                </Pressable>
              </View>
            )}
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 8, gap: 6 },
  item: { gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 36 },
  emoji: { fontSize: 16 },
  name: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  hint: { fontSize: 12, color: Colors.textSecondary },
  input: { flex: 1, height: 34, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background, color: Colors.textPrimary, fontSize: 14, outlineColor: Colors.accent },
  btn: { paddingHorizontal: 12, height: 32, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background, justifyContent: 'center' },
  btnText: { fontSize: 12, fontWeight: '600', color: Colors.textPrimary },
  danger: { fontSize: 12, fontWeight: '600', color: Colors.danger },
});
