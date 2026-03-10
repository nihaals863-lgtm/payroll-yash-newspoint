const db = require('../config/mysql');

/**
 * Get All Jobs (Public)
 */
const getAllJobs = async (req, res, next) => {
  try {
    const { search, location, job_type, status, page = 1, limit = 10 } = req.query;

    let query = `
            SELECT j.*, 
                   COALESCE(c.company_name, e.company_name) as display_company_name, 
                   COALESCE(c.company_logo, e.company_logo) as display_company_logo
            FROM jobs j 
            LEFT JOIN employers e ON j.employer_id = e.id 
            LEFT JOIN companies c ON e.company_id = c.id
            WHERE 1=1
        `;
    const params = [];

    // Filter by Status (Default Active)
    query += ' AND j.status = ?';
    params.push(status || 'Active');

    if (search) {
      query += ' AND (j.title LIKE ? OR j.description LIKE ? OR j.skills LIKE ?)';
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern);
    }

    if (location) {
      query += ' AND j.location LIKE ?';
      params.push(`%${location}%`);
    }

    if (job_type) {
      query += ' AND j.job_type = ?';
      params.push(job_type);
    }

    // Pagination
    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Clone for count before adding order/limit
    const countSql = `SELECT COUNT(*) as count FROM (${query}) as t`;
    const [countResult] = await db.query(countSql, params);
    const total = countResult[0].count;

    query += ' ORDER BY j.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), offset);

    const [jobs] = await db.query(query, params);

    // Format jobs
    const formattedJobs = jobs.map(job => ({
      ...job,
      employer: {
        id: job.employer_id,
        company_name: job.display_company_name,
        company_logo: job.display_company_logo
      }
    }));

    res.json({
      success: true,
      data: {
        jobs: formattedJobs,
        pagination: {
          total: total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(total / parseInt(limit)),
        },
      },
    });
  } catch (error) { next(error); }
};

/**
 * Get Single Job (Public)
 */
const getJobById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const query = `
            SELECT j.*, e.id as emp_id, 
                   COALESCE(c.company_name, e.company_name) as display_company_name, 
                   COALESCE(c.company_logo, e.company_logo) as display_company_logo, 
                   COALESCE(c.company_address, e.company_address) as display_company_address 
            FROM jobs j 
            LEFT JOIN employers e ON j.employer_id = e.id 
            LEFT JOIN companies c ON e.company_id = c.id
            WHERE j.id = ?
        `;
    const [rows] = await db.query(query, [id]);
    const job = rows[0];

    if (!job) return res.status(404).json({ success: false, message: 'Job not found.' });

    // Increment views count
    await db.query('UPDATE jobs SET views_count = views_count + 1 WHERE id = ?', [id]);

    // Format
    const formattedJob = {
      ...job,
      employer: {
        id: job.emp_id,
        company_name: job.display_company_name,
        company_logo: job.display_company_logo,
        company_address: job.display_company_address
      }
    };

    res.json({ success: true, data: formattedJob });
  } catch (error) { next(error); }
};

/**
 * Get Active Plans (Public)
 */
const getActivePlans = async (req, res, next) => {
  try {
    const [plans] = await db.query(`
            SELECT id, name, description, price, duration_months, max_employees, max_jobs, features 
            FROM plans 
            WHERE is_active = 1 
            ORDER BY price ASC
        `);
    const formattedPlans = plans.map(plan => {
      try {
        plan.features = typeof plan.features === 'string' ? JSON.parse(plan.features) : (plan.features || []);
      } catch (e) {
        plan.features = [];
      }
      return plan;
    });
    res.json({ success: true, data: formattedPlans });
  } catch (error) { next(error); }
};

/**
 * Create Company Signup Request (Public)
 */
const createCompanyRequest = async (req, res, next) => {
  try {
    const { company_name, contact_name, email, phone, plan_id, company_address, gst_number, pan_number, notes } = req.body;

    if (!company_name || !contact_name || !email || !plan_id) {
      return res.status(400).json({ success: false, message: 'Required fields missing.' });
    }

    const [planRows] = await db.query('SELECT * FROM plans WHERE id = ? AND is_active = 1', [plan_id]);
    if (planRows.length === 0) return res.status(404).json({ success: false, message: 'Plan not found.' });

    const [result] = await db.query(
      `INSERT INTO company_requests (company_name, contact_name, email, phone, plan_id, company_address, gst_number, pan_number, notes, payment_status, request_status, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'pending', NOW(), NOW())`,
      [company_name, contact_name, email.toLowerCase(), phone || null, plan_id, company_address || null, gst_number || null, pan_number || null, notes || null]
    );

    res.status(201).json({ success: true, message: 'Request submitted successfully.', data: { id: result.insertId } });
  } catch (error) { next(error); }
};

/**
 * Create User Request (Public)
 */
const createRequest = async (req, res, next) => {
  try {
    const { name, address, city, state, country, mobile, request_type } = req.body;

    if (!name || !address || !city || !state || !country || !mobile || !request_type) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required'
      });
    }

    // Security: Block Admin Registration
    if (request_type === 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin registration is restricted. Please contact support.'
      });
    }

    const query = `
            INSERT INTO user_requests (name, address, city, state, country, mobile, request_type)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;

    const [result] = await db.query(query, [name, address, city, state, country, mobile, request_type]);

    res.status(201).json({
      success: true,
      message: 'Request submitted successfully',
      data: { id: result.insertId }
    });
  } catch (error) { next(error); }
};

module.exports = {
  getAllJobs,
  getJobById,
  getActivePlans,
  createCompanyRequest,
  createRequest
};
