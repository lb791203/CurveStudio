// Feature switches for parts of the app that are built but not released.
// instrumentEntry: direct instrument (SDK) measurement page. Off until the vendor SDKs are
// integrated and tested; while off, the page and its navigation entry are not reachable.
export const FEATURES = Object.freeze({
  instrumentEntry: false,
});

const VIEW_FEATURE = { instrument: "instrumentEntry" };

export function isViewEnabled(view, features = FEATURES) {
  const feature = VIEW_FEATURE[view];
  return !feature || Boolean(features[feature]);
}

// Shows or hides every navigation entry and view behind a switch.
export function applyFeatureFlags(root, features = FEATURES) {
  for (const [view, feature] of Object.entries(VIEW_FEATURE)) {
    const enabled = Boolean(features[feature]);
    root.querySelectorAll(`[data-sub-view-button="${view}"], [data-view="${view}"]`).forEach((node) => {
      node.hidden = !enabled;
    });
  }
}
