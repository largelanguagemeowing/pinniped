import React, { useEffect, useState } from 'react';
import classNames from 'classnames';
import { Box, Header, Icon, IconButton, Icons, Scroll, Spinner, Text, as } from 'folds';
import { AsyncState, AsyncStatus } from '../../hooks/useAsyncCallback';
import { AttachmentTamperedError, AttachmentUnreadableError } from '../../utils/matrix';
import { stripUnsafeTextChars } from '../../utils/sanitize';
import {
  ImageMetadata,
  METADATA_SECTIONS,
  MetadataScan,
  MetadataSection,
} from './scanImageMetadata';
import * as css from './ImageMetadataViewer.css';

const SECTION_TITLES: Record<MetadataSection, string> = {
  location: 'Location',
  text: 'Names and text',
  time: 'Dates',
  device: 'Device',
  software: 'Software',
  camera: 'Camera settings',
  other: 'Other',
};

function EmbeddedPreview({ jpeg }: { jpeg: Uint8Array }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    const objectUrl = URL.createObjectURL(new Blob([jpeg.slice()], { type: 'image/jpeg' }));
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [jpeg]);

  return (
    <Box direction="Column" gap="200">
      <Text size="L400">Embedded preview</Text>
      <Text size="T200" priority="300">
        A separate copy stored by the camera or editor. It can show the picture before it was
        cropped or edited.
      </Text>
      {url && <img className={css.Preview} src={url} alt="Embedded preview" />}
    </Box>
  );
}

function MetadataFields({ metadata }: { metadata: ImageMetadata }) {
  return (
    <>
      <Box className={css.Notice} gap="300" alignItems="Start" role="note">
        <Icon size="200" src={Icons.Warning} filled />
        <Text size="T300">
          The sender&apos;s app left this information in the file. Anyone who can download the image
          can read it. Pinniped removes it from JPEG and PNG images you send.
        </Text>
      </Box>
      {METADATA_SECTIONS.map((section) => {
        const fields = metadata.fields.filter((field) => field.section === section);
        if (fields.length === 0) return null;
        return (
          <Box key={section} direction="Column" gap="200">
            <Text size="L400">{SECTION_TITLES[section]}</Text>
            <dl className={css.Fields}>
              {fields.map((field, index) => (
                <React.Fragment key={index}>
                  <Text as="dt" size="T300" priority="300">
                    {stripUnsafeTextChars(field.label)}
                  </Text>
                  <Text as="dd" size="T300" className={css.Value}>
                    {stripUnsafeTextChars(field.value)}
                  </Text>
                </React.Fragment>
              ))}
            </dl>
          </Box>
        );
      })}
      {metadata.thumbnail && <EmbeddedPreview jpeg={metadata.thumbnail} />}
    </>
  );
}

const scanMessage = (scan: Exclude<MetadataScan, { status: 'found' }>): string => {
  switch (scan.status) {
    case 'clean':
      return 'This image carries no metadata.';
    case 'unsupported':
      return 'Only JPEG, PNG and WebP images can be checked for metadata.';
    default:
      return 'The image file is damaged, so its metadata could not be read.';
  }
};

const errorMessage = (error: unknown): string => {
  if (error instanceof AttachmentTamperedError) {
    return 'This attachment failed its integrity check, so it was not read.';
  }
  if (error instanceof AttachmentUnreadableError) return "This attachment can't be decrypted.";
  return 'The image could not be downloaded.';
};

function ScanResult({ scan }: { scan: AsyncState<MetadataScan> }) {
  if (scan.status === AsyncStatus.Idle || scan.status === AsyncStatus.Loading) {
    return (
      <Box gap="300" alignItems="Center">
        <Spinner variant="Secondary" size="200" />
        <Text size="T300">Reading the image…</Text>
      </Box>
    );
  }
  if (scan.status === AsyncStatus.Error) {
    return (
      <Text size="T300" role="alert">
        {errorMessage(scan.error)}
      </Text>
    );
  }
  if (scan.data.status === 'found') return <MetadataFields metadata={scan.data.metadata} />;
  return <Text size="T300">{scanMessage(scan.data)}</Text>;
}

type ImageMetadataViewerProps = {
  scan: AsyncState<MetadataScan>;
  requestClose: () => void;
};

export const ImageMetadataViewer = as<'div', ImageMetadataViewerProps>(
  ({ className, scan, requestClose, ...props }, ref) => (
    <Box className={classNames(css.Viewer, className)} direction="Column" {...props} ref={ref}>
      <Header className={css.Header} variant="Surface" size="600">
        <Box grow="Yes">
          <Text size="H3">Image metadata</Text>
        </Box>
        <IconButton size="300" onClick={requestClose} aria-label="Close">
          <Icon src={Icons.Cross} />
        </IconButton>
      </Header>
      <Box grow="Yes">
        <Scroll visibility="Hover" hideTrack size="300">
          <Box className={css.Content} direction="Column" gap="500">
            <ScanResult scan={scan} />
          </Box>
        </Scroll>
      </Box>
    </Box>
  )
);
