/** Share (TECH_SPEC §16): the Web Share API where available, otherwise clipboard + toast. */
import type { Toaster } from '@/ui/toast';

export async function shareLab(toast: Toaster): Promise<void> {
  const url = window.location.href;
  const title = document.title;
  try {
    if (navigator.share) {
      await navigator.share({ title, url });
      return;
    }
    await navigator.clipboard.writeText(url);
    toast.show('Link copied');
  } catch {
    // the user cancelled the share sheet, or the clipboard is blocked
  }
}
