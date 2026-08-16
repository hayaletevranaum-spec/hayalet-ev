export interface PageController {
  init?: () => Promise<void> | void;
  onShow?: () => void;
  onHide?: () => void;
  dispose?: () => void;
}
