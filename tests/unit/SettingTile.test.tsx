import React from 'react';
import { act, create, ReactTestRenderer, ReactTestRendererJSON } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { Box, Text } from 'folds';
import { SettingTile } from '../../src/app/components/setting-tile';

vi.mock('../../src/app/styles/Text.css', () => ({ BreakWord: 'break-word' }));

// A p cannot contain another p or a div, which React reports as a DOM nesting warning.
const invalidNesting = (node: ReactTestRendererJSON | string, insideP = false): string[] => {
  if (typeof node === 'string') return [];
  const found = insideP && (node.type === 'p' || node.type === 'div') ? [node.type] : [];
  const children = (node.children ?? []).flatMap((child) =>
    invalidNesting(child, insideP || node.type === 'p')
  );
  return [...found, ...children];
};

const render = (element: React.ReactElement) => {
  let renderer: ReactTestRenderer;
  act(() => {
    renderer = create(element);
  });
  // Read the tree after act, once React has committed.
  const json = renderer!.toJSON();
  return ([] as ReactTestRendererJSON[]).concat(json ?? []);
};

describe('SettingTile', () => {
  it('accepts blocks in a description without invalid nesting', () => {
    const tree = render(
      <SettingTile
        title="Publish rich presence"
        description={
          <Box direction="Column" gap="100">
            <Text size="T200">First paragraph.</Text>
            <Text size="T200">Second paragraph.</Text>
          </Box>
        }
      />
    );
    expect(tree.length).toBeGreaterThan(0);
    expect(tree.flatMap((node) => invalidNesting(node))).toEqual([]);
  });

  it('accepts blocks in a title without invalid nesting', () => {
    const tree = render(
      <SettingTile
        title={
          <Box>
            <Text size="T300">Role</Text>
          </Box>
        }
      />
    );
    expect(tree.length).toBeGreaterThan(0);
    expect(tree.flatMap((node) => invalidNesting(node))).toEqual([]);
  });

  it('still renders plain text titles and descriptions', () => {
    const tree = render(<SettingTile title="Title" description="Description" />);
    expect(JSON.stringify(tree)).toContain('Title');
    expect(JSON.stringify(tree)).toContain('Description');
  });
});
