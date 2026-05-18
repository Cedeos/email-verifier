import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://mqdlwzwlzreampufqxzg.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1xZGx3endsenJlYW1wdWZxeHpnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMzI5NzQsImV4cCI6MjA5NDcwODk3NH0.m37TS6cFSkgNLD-Yj9qej09Fqns1NEBi5p8tnjHn5Jo'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
