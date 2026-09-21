import { supabaseAdmin } from '../src/config/supabase';

async function check() {
  console.log('Testing Supabase tables...');
  
  const tables = ['admins', 'pgs', 'rooms', 'beds', 'tenants', 'rent_records', 'payments'];
  for (const table of tables) {
    const { data, error } = await supabaseAdmin.from(table).select('*').limit(1);
    if (error) {
      console.log(`❌ Table '${table}': ERROR - ${error.message} (${error.code || ''})`);
    } else {
      console.log(`✅ Table '${table}': OK (found ${data?.length ?? 0} rows)`);
    }
  }
  process.exit(0);
}

check().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
