import { globalStyle } from '@vanilla-extract/css';
import { color } from 'folds';

// The theme tokens live on body; painting it keeps the browser's white canvas from showing
// wherever the app leaves a gap, scrolls past its edge, or is used to tint the browser chrome.
globalStyle('body', {
  backgroundColor: color.Background.Container,
});
