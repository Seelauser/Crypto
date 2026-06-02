'use client';

/**
 * Drawer — mobile bottom-sheet wrapper around Vaul.
 *
 * Vaul is the gold-standard React drawer (Linear / Vercel / shadcn use
 * it). It handles drag-to-dismiss, snap points, scroll lock, focus
 * trap, iOS notch, and reduced-motion preferences. Wrapping it locally
 * lets the rest of the app import a single `Drawer` primitive without
 * each call site reproducing the same Tailwind chrome.
 *
 * Usage:
 *   <Drawer open={isOpen} onOpenChange={setOpen} title="Filters">
 *     <FilterForm />
 *   </Drawer>
 */

import { Drawer as VaulDrawer } from 'vaul';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';

interface DrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export function Drawer({ open, onOpenChange, title, children, className }: DrawerProps) {
  return (
    <VaulDrawer.Root open={open} onOpenChange={onOpenChange}>
      <VaulDrawer.Portal>
        <VaulDrawer.Overlay className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" />
        <VaulDrawer.Content
          className={cn(
            'fixed inset-x-0 bottom-0 z-50 flex max-h-[92vh] flex-col rounded-t-2xl border border-border bg-panel',
            // iOS home-indicator safe area
            'pb-[env(safe-area-inset-bottom)]',
            className,
          )}
        >
          {/* Drag handle */}
          <div className="mx-auto mt-2 mb-2 h-1.5 w-12 rounded-full bg-border-hi" aria-hidden />
          {title && (
            <div className="flex items-center justify-between px-4 pb-2">
              <VaulDrawer.Title className="text-sm font-semibold text-fg">
                {title}
              </VaulDrawer.Title>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="flex h-9 w-9 items-center justify-center rounded-md text-fg-muted hover:bg-panel-hi"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
          )}
          <div className="overflow-y-auto px-4 pb-4">{children}</div>
        </VaulDrawer.Content>
      </VaulDrawer.Portal>
    </VaulDrawer.Root>
  );
}
