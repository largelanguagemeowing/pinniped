import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import parse from 'html-react-parser';
import { Box, Text, as, color, config, toRem } from 'folds';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useMediaAuthentication } from '../../hooks/useMediaAuthentication';
import { parseBlockMD, parseInlineMD } from '../../plugins/markdown';
import { LINKIFY_OPTS, getReactCustomHtmlParser } from '../../plugins/react-custom-html-parser';
import { sanitizeCustomHtml, sanitizeText } from '../../utils/sanitize';

const COLLAPSED_LINES = 6;

type UserBiographyProps = {
  biography: string;
};
export const UserBiography = as<'div', UserBiographyProps>(({ biography, ...props }, ref) => {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const textRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);

  const content = useMemo(
    () =>
      parse(
        sanitizeCustomHtml(parseBlockMD(sanitizeText(biography), parseInlineMD)),
        getReactCustomHtmlParser(mx, undefined, { linkifyOpts: LINKIFY_OPTS, useAuthentication })
      ),
    [mx, biography, useAuthentication]
  );

  useLayoutEffect(() => {
    const el = textRef.current;
    if (!el || expanded) return;
    setOverflowing(el.scrollHeight > el.clientHeight + 1);
  }, [biography, expanded]);

  return (
    <Box direction="Column" gap="100" {...props} ref={ref}>
      <Text
        as="div"
        ref={textRef}
        size="T300"
        priority="300"
        style={{
          overflowWrap: 'anywhere',
          ...(expanded
            ? {
                maxHeight: 'min(40vh, 15rem)',
                overflowY: 'auto',
                // A thin themed scrollbar, not the browser's chunky grey one with arrows.
                scrollbarWidth: 'thin',
                scrollbarColor: `${color.SurfaceVariant.ContainerLine} transparent`,
                paddingRight: toRem(8),
              }
            : { maxHeight: `${COLLAPSED_LINES}lh`, overflow: 'hidden' }),
        }}
      >
        {content}
      </Text>
      {(overflowing || expanded) && (
        <Text
          as="button"
          type="button"
          size="T200"
          priority="400"
          onClick={() => setExpanded((e) => !e)}
          style={{
            alignSelf: 'flex-start',
            cursor: 'pointer',
            background: 'none',
            border: 'none',
            padding: 0,
            marginTop: config.space.S100,
            textDecoration: 'underline',
          }}
        >
          {expanded ? 'Show less' : 'Show more'}
        </Text>
      )}
    </Box>
  );
});
