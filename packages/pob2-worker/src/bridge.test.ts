import { describe, it, expect, vi, beforeEach } from 'vitest';
import { spawn } from 'child_process';
import { Pob2Bridge } from './bridge';

vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

describe('Pob2Bridge', () => {
  let mockProcess: any;
  let mockStdout: any;
  let mockStdin: any;
  let mockStderr: any;

  beforeEach(() => {
    mockStdin = { write: vi.fn(), on: vi.fn() };
    mockStdout = { on: vi.fn() };
    mockStderr = { on: vi.fn() };
    mockProcess = {
      stdout: mockStdout,
      stdin: mockStdin,
      stderr: mockStderr,
      on: vi.fn(),
      killed: false,
      exitCode: null,
      kill: vi.fn(),
    };
    (spawn as any).mockReturnValue(mockProcess);
  });

  it('should spawn python and send a JSON request', async () => {
    const bridge = new Pob2Bridge({
      pythonPath: 'python',
      driverPath: 'driver.py',
      requestTimeoutMs: 10000,
      pobSrcDir: 'D:/PathOfBuilding-PoE2-dev/src',
    });

    const promise = bridge.execute({
      buildXml: '<Build/>',
      skillNumber: 1,
      weaponSet: 1,
      config: {},
    });

    // Simulate response from Python stdout
    setTimeout(() => {
      const dataHandler = mockStdout.on.mock.calls.find(
        (call: any) => call[0] === 'data',
      )[1];
      dataHandler(
        Buffer.from('{"success":true,"calcsOutput":{"CombinedDPS":1000}}\n'),
      );
    }, 10);

    const response = await promise;
    expect(response.success).toBe(true);
    expect(response.calcsOutput?.CombinedDPS).toBe(1000);
    expect(mockStdin.write).toHaveBeenCalledWith(
      '{"buildXml":"<Build/>","skillNumber":1,"weaponSet":1,"config":{}}\n',
    );
  });

  it('should timeout when no response is received', async () => {
    const bridge = new Pob2Bridge({
      pythonPath: 'python',
      driverPath: 'driver.py',
      requestTimeoutMs: 50,
      pobSrcDir: 'D:/PathOfBuilding-PoE2-dev/src',
    });

    await expect(
      bridge.execute({
        buildXml: '<Build/>',
        skillNumber: 1,
        weaponSet: 1,
        config: {},
      }),
    ).rejects.toThrow('Request timeout');
  });

  it('should reject queued requests when process exits', async () => {
    const bridge = new Pob2Bridge({
      pythonPath: 'python',
      driverPath: 'driver.py',
      requestTimeoutMs: 10000,
      pobSrcDir: 'D:/PathOfBuilding-PoE2-dev/src',
    });

    const promise = bridge.execute({
      buildXml: '<Build/>',
      skillNumber: 1,
      weaponSet: 1,
      config: {},
    });

    setTimeout(() => {
      const exitHandler = mockProcess.on.mock.calls.find(
        (call: any) => call[0] === 'exit',
      )[1];
      exitHandler(1, null);
    }, 10);

    await expect(promise).rejects.toThrow('Python process exited');
  });
});
