import React from 'react';
import { Text } from 'react-native';
import { tipRef } from './tip';

// The emoji of a task's list on a Calendar or Timebox block's time line, right after the
// duration (2.34.0). Nothing when the list has no emoji; a hover tooltip names the list.
// Never on a block too short for its time line, and never in a corner: it is part of the line.
export default function ListEmoji({ emoji, name }: { emoji?: string; name?: string }) {
  if (!emoji) return null;
  return (
    <Text ref={tipRef(name) as never} accessibilityLabel={name ? `List ${name}` : undefined} {...({ dataSet: { blockListEmoji: '1' } } as object)}>
      {emoji}
    </Text>
  );
}
