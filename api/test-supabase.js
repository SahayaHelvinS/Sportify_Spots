import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  try {
    // Test insert
    const { data, error } = await supabase
      .from('conversations')
      .insert([
        {
          session_id: 'test-session',
          role: 'system',
          message: 'Supabase connection test'
        }
      ])
      .select();

    if (error) {
      return res.status(500).json({ success: false, error });
    }

    return res.status(200).json({
      success: true,
      message: 'Supabase connected successfully!',
      data
    });

  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
}