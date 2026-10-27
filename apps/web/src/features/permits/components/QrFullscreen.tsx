import { X } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../shared/ui/button';

/**
 * The QR code over the whole screen for the inspector's camera (docs/06-frontend.md), with the
 * permit number as text for when the code cannot be scanned. The page under it is inert (no focus,
 * no scrolling); Escape or «Zamknij» closes it.
 */
export function QrFullscreen({
  value,
  number,
  onClose,
}: {
  value: string;
  number: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Everything but the dialog (a direct child of body, see the portal) leaves the tab order and
    // the accessibility tree, and the page under it stops scrolling.
    const background = [...document.body.children].filter(
      (element) => element !== dialogRef.current && !element.hasAttribute('inert'),
    );
    background.forEach((element) => element.setAttribute('inert', ''));
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    const previous = document.activeElement;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = overflow;
      background.forEach((element) => element.removeAttribute('inert'));
      // After `inert` is gone: an inert element cannot take focus.
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, [onClose]);

  // Above the header and the map (Leaflet panes go up to z-index 1000).
  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-[2000] flex flex-col items-center justify-center gap-4 overflow-y-auto bg-card p-4 text-foreground"
    >
      <h2 id={titleId} className="text-h2">
        {t('permits.qr.fullscreenTitle')}
      </h2>
      <QRCodeSVG
        value={value}
        size={512}
        level="M"
        marginSize={4}
        title={t('permits.qr.alt', { number })}
        className="aspect-square h-auto w-full max-w-[min(100%,70dvh)]"
      />
      <p className="font-mono text-h2 font-medium">{number}</p>
      <p className="text-center text-body text-muted-foreground">{t('permits.qr.brightness')}</p>
      <Button ref={closeRef} variant="secondary" onClick={onClose}>
        <X aria-hidden />
        {t('permits.qr.close')}
      </Button>
    </div>,
    document.body,
  );
}
