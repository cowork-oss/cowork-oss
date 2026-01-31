/**
 * Tailscale Integration Module
 *
 * Provides utilities for Tailscale Serve and Funnel functionality.
 * - Serve: Share local services to your Tailnet (private network)
 * - Funnel: Expose local services to the public internet via Tailscale
 */

export {
  findTailscaleBinary,
  getTailscaleBinary,
  isTailscaleInstalled,
  getTailscaleStatus,
  getTailnetHostname,
  enableTailscaleServe,
  disableTailscaleServe,
  enableTailscaleFunnel,
  disableTailscaleFunnel,
  checkTailscaleFunnelAvailable,
} from './tailscale';

export {
  TailscaleSettingsManager,
  type TailscaleSettings,
} from './settings';

export {
  startTailscaleExposure,
  type TailscaleExposureConfig,
  type TailscaleExposureResult,
} from './exposure';
