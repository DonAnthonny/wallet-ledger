import  AppDataSource  from './data-source';

async function run() {
  await AppDataSource.initialize();
  try {
    await AppDataSource.runMigrations({ transaction: 'all' });
  } finally {
    await AppDataSource.destroy();
  }
}
run().catch(error => { console.error('Database migration failed', error); process.exit(1); });
