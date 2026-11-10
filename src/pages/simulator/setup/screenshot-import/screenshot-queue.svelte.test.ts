import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ScreenshotQueue } from './screenshot-queue.svelte';
import type { ScreenshotReading } from './screenshot-veteran';
import type { SkillNameIndex } from './skill-names';

const read = vi.fn<(file: File) => Promise<ScreenshotReading>>();
const stop = vi.fn(async () => {});

vi.mock('./screenshot-reader', () => ({
  ScreenshotReader: class {
    read = read;
    stop = stop;
  }
}));

const skillNames = {} as SkillNameIndex;

function reading(stats: ScreenshotReading['stats']): ScreenshotReading {
  return { stats, aptitudes: {}, skills: [], choices: [], titleLines: [] };
}

function screenshot(name: string): File {
  return new File(['x'], name, { type: 'image/png' });
}

beforeEach(() => {
  read.mockReset();
  stop.mockClear();
  URL.createObjectURL = vi.fn(() => 'blob:screenshot');
  URL.revokeObjectURL = vi.fn();
});

describe('ScreenshotQueue', () => {
  it('reads screenshots in the order they were added and merges them', async () => {
    read.mockImplementation(async (file) =>
      reading(file.name === 'top.png' ? { speed: 1200 } : { speed: 900, stamina: 600 })
    );
    const queue = new ScreenshotQueue();

    queue.add([screenshot('top.png'), screenshot('list.png')]);
    await queue.read(skillNames);

    expect(read.mock.calls.map(([file]) => file.name)).toEqual(['top.png', 'list.png']);
    expect(queue.reading?.stats).toEqual({ speed: 1200, stamina: 600 });
    expect(queue.progress).toBeUndefined();
  });

  it('keeps a screenshot that failed with its reason and merges the rest', async () => {
    read
      .mockRejectedValueOnce(new Error('Not a details screen.'))
      .mockResolvedValueOnce(reading({ speed: 1000 }));
    const queue = new ScreenshotQueue();

    queue.add([screenshot('menu.png'), screenshot('top.png')]);
    await queue.read(skillNames);

    expect(queue.screenshots[0]?.state).toEqual({
      status: 'failed',
      error: 'Not a details screen.'
    });
    expect(queue.reading?.stats).toEqual({ speed: 1000 });
  });

  it('forgets a removed screenshot’s reading', async () => {
    read.mockResolvedValue(reading({ speed: 1000 }));
    const queue = new ScreenshotQueue();
    queue.add([screenshot('top.png')]);
    await queue.read(skillNames);

    queue.remove(queue.screenshots[0]!.id);

    expect(queue.reading).toBeUndefined();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:screenshot');
  });

  it('puts a screenshot stopped mid-read back in line', async () => {
    let finish: (value: ScreenshotReading) => void = () => {};
    read.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    const queue = new ScreenshotQueue();
    queue.add([screenshot('top.png')]);

    const pending = queue.read(skillNames);
    await vi.waitFor(() => expect(read).toHaveBeenCalled());
    await queue.stop();
    finish(reading({ speed: 1000 }));
    await pending;

    expect(queue.screenshots[0]?.state).toEqual({ status: 'waiting' });
    expect(queue.waiting).toBe(true);
  });
});
