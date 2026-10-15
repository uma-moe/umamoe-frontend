import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { copyText } from './clipboard';

const originalExecCommand = Object.getOwnPropertyDescriptor(document, 'execCommand');
const execCommand = vi.fn<(command: string) => boolean>();

beforeEach(() => {
  execCommand.mockReset().mockReturnValue(true);
  Object.defineProperty(document, 'execCommand', {
    configurable: true,
    writable: true,
    value: execCommand
  });
});

afterEach(() => {
  document.body.innerHTML = '';
  if (originalExecCommand) Object.defineProperty(document, 'execCommand', originalExecCommand);
  else Reflect.deleteProperty(document, 'execCommand');

  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('copyText', () => {
  it.each(['Trainer ID', ''])(
    'uses the native clipboard without a selection for %j',
    async (value) => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      vi.stubGlobal('navigator', { clipboard: { writeText } });

      expect(await copyText(value)).toBe(true);
      expect(writeText).toHaveBeenCalledExactlyOnceWith(value);
      expect(execCommand).not.toHaveBeenCalled();
      expect(document.querySelector('textarea')).toBeNull();
    }
  );

  it('copies through a temporary body selection when the clipboard API is missing', async () => {
    vi.stubGlobal('navigator', {});
    const select = vi.spyOn(HTMLTextAreaElement.prototype, 'select');
    execCommand.mockImplementation((command) => {
      const input = document.body.querySelector('textarea');
      expect(command).toBe('copy');
      expect(input?.parentElement).toBe(document.body);
      expect(input?.value).toBe('Legacy copy');
      expect(input?.readOnly).toBe(true);
      return true;
    });

    expect(await copyText('Legacy copy')).toBe(true);
    expect(select).toHaveBeenCalledOnce();
    expect(document.querySelector('textarea')).toBeNull();
  });

  it.each(['success', 'failure', 'exception'] as const)(
    'keeps a denied-permission fallback in the open dialog and restores focus after %s',
    async (outcome) => {
      vi.stubGlobal('navigator', {
        clipboard: { writeText: vi.fn().mockRejectedValue(new Error('Denied')) }
      });

      const dialog = document.createElement('dialog');
      dialog.setAttribute('open', '');
      const button = document.createElement('button');
      dialog.append(button);
      document.body.append(dialog);
      button.focus();
      const restoreFocus = vi.spyOn(button, 'focus');
      execCommand.mockImplementation(() => {
        expect(dialog.querySelector('textarea')?.value).toBe('Dialog copy');
        if (outcome === 'exception') throw new Error('Copy unavailable');
        return outcome === 'success';
      });

      expect(await copyText('Dialog copy')).toBe(outcome === 'success');
      expect(document.querySelector('textarea')).toBeNull();
      expect(restoreFocus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
      expect(document.activeElement).toBe(button);
    }
  );

  it('removes the selection without refocusing a control removed during copying', async () => {
    vi.stubGlobal('navigator', {});
    const button = document.createElement('button');
    document.body.append(button);
    button.focus();
    const restoreFocus = vi.spyOn(button, 'focus');
    execCommand.mockImplementation(() => {
      button.remove();
      return true;
    });

    expect(await copyText('Removed control')).toBe(true);
    expect(restoreFocus).not.toHaveBeenCalled();
    expect(document.querySelector('textarea')).toBeNull();
  });
});
