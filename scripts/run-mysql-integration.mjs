import { spawn, spawnSync } from 'node:child_process';

const containerName = `baas-mysql-tests-${process.pid}-${Date.now()}`;
const password = 'baas-test-password';
const testDatabaseName = 'baas_test';

if (!/^baas_test$/u.test(testDatabaseName)) throw new Error('UNSAFE_TEST_DATABASE_NAME');

function docker(args, options = {}) {
  const result = spawnSync('docker', args, { encoding: 'utf8', ...options });
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`MYSQL_TEST_CONTAINER_FAILED: ${result.stderr.trim()}`);
  }
  return result;
}

async function waitForMysql() {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const result = docker(
      [
        'exec',
        containerName,
        'mysqladmin',
        'ping',
        '--host=127.0.0.1',
        '--user=root',
        `--password=${password}`,
        '--silent'
      ],
      { allowFailure: true }
    );
    if (result.status === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error('MYSQL_TEST_CONTAINER_TIMEOUT');
}

function runJest(port) {
  return new Promise((resolve, reject) => {
    const forwardedArgs = process.argv.slice(2);
    if (forwardedArgs.length > 0 && !forwardedArgs[0].startsWith('-'))
      forwardedArgs.unshift('--runTestsByPath');
    const command =
      process.platform === 'win32'
        ? [
            process.env.ComSpec ?? 'cmd.exe',
            [
              '/d',
              '/s',
              '/c',
              `npm run test:integration:jest --workspace @baas/api -- ${forwardedArgs.join(' ')}`
            ]
          ]
        : [
            'npm',
            ['run', 'test:integration:jest', '--workspace', '@baas/api', '--', ...forwardedArgs]
          ];
    const [executable, args] = command;
    const child = spawn(executable, args, {
      env: {
        ...process.env,
        MYSQL_TEST_DATABASE: testDatabaseName,
        MYSQL_TEST_HOST: '127.0.0.1',
        MYSQL_TEST_PASSWORD: password,
        MYSQL_TEST_PORT: port,
        MYSQL_TEST_USER: 'baas'
      },
      stdio: 'inherit'
    });
    child.once('error', reject);
    child.once('exit', (code) => resolve(code ?? 1));
  });
}

let started = false;
try {
  docker([
    'run',
    '--detach',
    '--rm',
    '--name',
    containerName,
    '--env',
    `MYSQL_DATABASE=${testDatabaseName}`,
    '--env',
    'MYSQL_USER=baas',
    '--env',
    `MYSQL_PASSWORD=${password}`,
    '--env',
    `MYSQL_ROOT_PASSWORD=${password}`,
    '--publish',
    '127.0.0.1::3306',
    'mysql:8.4'
  ]);
  started = true;
  await waitForMysql();
  const port = docker(['port', containerName, '3306/tcp']).stdout.trim().split(':').at(-1);
  if (!port) throw new Error('MYSQL_TEST_CONTAINER_PORT_MISSING');
  process.exitCode = await runJest(port);
} finally {
  if (started) docker(['rm', '--force', containerName], { allowFailure: true });
}
