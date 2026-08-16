export async function handleProtocolLocaleChange(args: {
  isOpen: boolean;
  applyTranslations: () => void;
  loadProtocols: () => Promise<void>;
}): Promise<void> {
  const { isOpen, applyTranslations, loadProtocols } = args;

  applyTranslations();
  if (!isOpen) {
    return;
  }

  await loadProtocols();
  applyTranslations();
}
