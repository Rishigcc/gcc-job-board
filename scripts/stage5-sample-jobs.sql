-- ===========================================================================
-- Stage 5 test data: 24 roles so the list page can actually be tested.
--
-- WHY THIS EXISTS
--   Filters, pagination and the salary formats need more than the one role
--   currently posted, and posting 24 by hand through the form is an hour of
--   clicking that proves nothing stage 4 did not already prove.
--
-- WHAT IT IS NOT
--   This is NOT how a recruiter posts. Run in the SQL editor you are the
--   `postgres` role, so the insert policy, the column grants and the
--   10-live-roles trigger are all bypassed -- the trigger checks
--   auth.uid(), which is null here. Those were tested through the form in
--   stage 4. This is scenery for the candidate side.
--
-- SAFE: it only inserts, and only rows whose title starts with "[T5]" so
-- they can all be removed again by the delete at the bottom.
--
-- Everything here is on PRODUCTION and must be deleted before the merge.
-- ===========================================================================

insert into public.jobs (
  company_id, posted_by, title, slug, city, work_mode, job_function,
  employment_type, experience_min, experience_max, description, apply_mode,
  salary_min, salary_max, salary_currency, salary_period, openings, skills,
  published_at, expires_at
)
select
  c.id,
  u.id,
  '[T5] ' || d.title,
  d.slug,
  d.city,
  d.work_mode,
  d.job_function,
  d.employment_type,
  d.exp_min,
  d.exp_max,
  d.title || ' at a Global Capability Centre in ' || d.city ||
    '. This is sample data created for stage 5 testing of the iWorkAtGCC job board. ' ||
    'It describes the team, the reporting line and what the role owns.',
  'in_platform',
  d.sal_min,
  d.sal_max,
  case when d.sal_min is null and d.sal_max is null then null else 'INR' end,
  case when d.sal_min is null and d.sal_max is null then null else d.sal_period end,
  d.openings,
  d.skills,
  now() - (d.age_days || ' days')::interval,
  now() - (d.age_days || ' days')::interval + interval '30 days'
from (values
  ('Senior Financial Analyst',      't5-senior-financial-analyst',  'Bengaluru',   'hybrid', 'Finance & Accounting',          'full_time', 4,  8,  1800000, 2600000, 'year',  2,    array['SAP FICO','IFRS','Power BI'],        1),
  ('Data Engineer',                 't5-data-engineer',             'Hyderabad',   'remote', 'Data & AI',                     'full_time', 3,  6,  2200000, 3200000, 'year',  3,    array['Python','Airflow','Snowflake'],      1),
  ('Platform Engineer',             't5-platform-engineer',         'Pune',        'onsite', 'IT & Engineering',              'full_time', 5,  9,  2400000, 3600000, 'year',  1,    array['Kubernetes','Terraform','AWS'],      2),
  ('Security Analyst',              't5-security-analyst',          'Chennai',     'hybrid', 'Cybersecurity',                 'full_time', 2,  5,  1400000, 2000000, 'year',  2,    array['SIEM','Incident Response'],          2),
  ('Payroll Specialist',            't5-payroll-specialist',        'Mumbai',      'onsite', 'Human Resources',               'full_time', 3,  7,  900000,  1400000, 'year',  1,    array['Workday','Payroll'],                 3),
  ('Procurement Manager',           't5-procurement-manager',       'Gurugram',    'hybrid', 'Supply Chain & Procurement',    'full_time', 7,  12, 2600000, 3800000, 'year',  1,    array['Sourcing','Contracts'],              3),
  ('Risk Analyst',                  't5-risk-analyst',              'Bengaluru',   'onsite', 'Risk & Compliance',             'full_time', 2,  4,  1200000, 1700000, 'year',  4,    array['AML','KYC'],                         4),
  ('Product Manager',               't5-product-manager',           'Hyderabad',   'hybrid', 'Product',                       'full_time', 6,  10, 3000000, 4500000, 'year',  1,    array['Roadmapping','Discovery'],           4),
  ('Customer Support Lead',         't5-customer-support-lead',     'Noida',       'onsite', 'Customer Support',              'full_time', 4,  8,  800000,  1200000, 'year',  2,    array['Zendesk','Escalations'],             5),
  ('Clinical Data Manager',         't5-clinical-data-manager',     'Hyderabad',   'hybrid', 'Clinical & Medical Affairs',    'full_time', 5,  9,  1900000, 2800000, 'year',  1,    array['EDC','GCP'],                         5),
  ('Legal Counsel',                 't5-legal-counsel',             'Mumbai',      'hybrid', 'Legal',                         'full_time', 8,  14, 3500000, 5000000, 'year',  1,    array['Commercial Contracts'],              6),
  ('Programme Manager',             't5-programme-manager',         'Pune',        'remote', 'Program & Project Management',  'full_time', 8,  13, 2800000, 4000000, 'year',  1,    array['PMP','Stakeholder Management'],      6),
  ('Marketing Executive',           't5-marketing-executive',       'Bengaluru',   'hybrid', 'Sales & Marketing',             'full_time', 1,  3,  600000,  900000,  'year',  2,    array['SEO','Content'],                     7),
  ('Operations Associate',          't5-operations-associate',      'Coimbatore',  'onsite', 'Operations',                    'full_time', 0,  2,  null,    null,    'year',  5,    array['Excel','Process Mapping'],           7),
  ('Machine Learning Engineer',     't5-ml-engineer',               'Bengaluru',   'remote', 'Data & AI',                     'full_time', 4,  7,  2800000, 4200000, 'year',  2,    array['PyTorch','MLOps'],                   8),
  ('Financial Controller',          't5-financial-controller',      'Chennai',     'onsite', 'Finance & Accounting',          'full_time', 10, 16, 4000000, 5500000, 'year',  1,    array['Statutory Reporting','IndAS'],       8),
  ('HR Business Partner',           't5-hr-business-partner',       'Gurugram',    'hybrid', 'Human Resources',               'full_time', 6,  10, 1800000, 2600000, 'year',  1,    array['Employee Relations'],                9),
  ('QA Automation Engineer',        't5-qa-automation-engineer',    'Indore',      'remote', 'IT & Engineering',              'full_time', 3,  6,  1400000, 2100000, 'year',  3,    array['Selenium','Playwright'],             9),
  ('Supply Chain Analyst',          't5-supply-chain-analyst',      'Jaipur',      'onsite', 'Supply Chain & Procurement',    'full_time', 2,  5,  900000,  1300000, 'year',  2,    array['SAP MM','Forecasting'],              10),
  ('Compliance Officer',            't5-compliance-officer',        'Kochi',       'hybrid', 'Risk & Compliance',             'contract',  5,  9,  150000,  220000,  'month', 1,    array['Regulatory Reporting'],              10),
  ('Graduate Analyst',              't5-graduate-analyst',          'Visakhapatnam','onsite','Finance & Accounting',          'full_time', 0,  0,  null,    null,    'year',  10,   array['Excel'],                             11),
  ('Technical Writer',              't5-technical-writer',          'Anywhere in India', 'remote', 'IT & Engineering',        'part_time', 3,  8,  60000,   90000,   'month', 1,    array['DITA','API Docs'],                   11),
  ('Summer Intern, Data',           't5-summer-intern-data',        'Bhubaneswar', 'onsite', 'Data & AI',                     'internship',0,  1,  25000,   25000,   'month', 4,    array['SQL'],                               12),
  ('Head of Shared Services',       't5-head-of-shared-services',   'Chandigarh',  'hybrid', 'Operations',                    'full_time', 14, 20, 5000000, 7000000, 'year',  1,    array['Transitions','Six Sigma'],           12)
) as d(title, slug, city, work_mode, job_function, employment_type,
       exp_min, exp_max, sal_min, sal_max, sal_period, openings, skills, age_days)
cross join lateral (
  select id from public.companies where slug = 'test-co-b'
) c
cross join lateral (
  select id from auth.users where email = 'community@iworkatgcc.com'
) u;

-- Check: expect 24 rows back.
select count(*) as inserted from public.jobs where title like '[T5]%';


-- ===========================================================================
-- CLEANUP -- run this when stage 5 testing is finished.
-- ===========================================================================
-- delete from public.jobs where title like '[T5]%';
