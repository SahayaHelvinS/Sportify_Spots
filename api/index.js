require('dotenv').config();
const express = require("express");
const serverless = require("serverless-http");
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();

// Initialize Supabase Client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Initialize Razorpay Client
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID || 'YOUR_KEY_ID',
    key_secret: process.env.RAZORPAY_KEY_SECRET || 'YOUR_KEY_SECRET'
});

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors());

// Data directory and files
const dataDir = path.join(__dirname, '..', 'data');
const membersFile = path.join(dataDir, 'members.json');
const bookingsFile = path.join(dataDir, 'bookings.json');

// Ensure data directory exists
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// Helper functions
function readMembers() {
    try {
        if (!fs.existsSync(membersFile)) return [];
        return JSON.parse(fs.readFileSync(membersFile, 'utf8'));
    } catch (error) {
        console.error('Error reading members:', error);
        return [];
    }
}

function writeMembers(members) {
    try {
        fs.writeFileSync(membersFile, JSON.stringify(members, null, 2));
    } catch (error) {
        console.error('Error writing members:', error);
    }
}

function readBookings() {
    try {
        if (!fs.existsSync(bookingsFile)) return [];
        return JSON.parse(fs.readFileSync(bookingsFile, 'utf8'));
    } catch (error) {
        console.error('Error reading bookings:', error);
        return [];
    }
}

function writeBookings(bookings) {
    try {
        fs.writeFileSync(bookingsFile, JSON.stringify(bookings, null, 2));
    } catch (error) {
        console.error('Error writing bookings:', error);
    }
}

// ============ RAZORPAY ENDPOINTS ============

/**
 * POST /api/membership/create-order
 * Create a Razorpay order for membership
 */
app.post('/api/membership/create-order', async (req, res) => {
    try {
        const { plan, email } = req.body;

        const prices = {
            'monthly': 499,
            'pro-plus': 999,
            'yearly': 4999
        };

        const amount = (prices[plan] || 499) * 100; // in paise

        const options = {
            amount: amount,
            currency: "INR",
            receipt: `receipt_mem_${Date.now()}`,
        };

        const order = await razorpay.orders.create(options);

        res.json({
            success: true,
            order_id: order.id,
            amount: amount,
            key_id: process.env.RAZORPAY_KEY_ID || 'YOUR_KEY_ID'
        });
    } catch (error) {
        console.error('Error creating order:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * POST /api/membership/verify-payment
 * Verify Razorpay payment signature
 */
app.post('/api/membership/verify-payment', (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

        const sign = razorpay_order_id + "|" + razorpay_payment_id;
        const expectedSign = crypto
            .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET || 'YOUR_KEY_SECRET')
            .update(sign.toString())
            .digest("hex");

        if (razorpay_signature === expectedSign) {
            res.json({ success: true, message: "Payment verified successfully" });
        } else {
            res.status(400).json({ success: false, message: "Invalid signature" });
        }
    } catch (error) {
        console.error('Error verifying payment:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * POST /api/bookings/create-order
 * Create a Razorpay order for ground booking
 */
app.post('/api/bookings/create-order', async (req, res) => {
    try {
        const { amount } = req.body; // amount in INR

        const options = {
            amount: Math.round(amount * 100), // in paise
            currency: "INR",
            receipt: `receipt_book_${Date.now()}`,
        };

        const order = await razorpay.orders.create(options);

        res.json({
            success: true,
            order_id: order.id,
            amount: options.amount,
            key_id: process.env.RAZORPAY_KEY_ID || 'YOUR_KEY_ID'
        });
    } catch (error) {
        console.error('Error creating booking order:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * POST /api/bookings/verify-payment
 * Verify Razorpay payment signature for bookings
 */
app.post('/api/bookings/verify-payment', (req, res) => {
    // Reuse the same logic as membership verification
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

        const sign = razorpay_order_id + "|" + razorpay_payment_id;
        const expectedSign = crypto
            .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET || 'YOUR_KEY_SECRET')
            .update(sign.toString())
            .digest("hex");

        if (razorpay_signature === expectedSign) {
            res.json({ success: true, message: "Payment verified successfully" });
        } else {
            res.status(400).json({ success: false, message: "Invalid signature" });
        }
    } catch (error) {
        console.error('Error verifying booking payment:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============ MEMBERSHIP ENDPOINTS ============

/**
 * POST /api/membership/checkout
 * Create or update membership
 */
app.post('/api/membership/checkout', async (req, res) => {
    try {
        const {
            firstName,
            lastName,
            email,
            phone,
            address,
            city,
            state,
            zipCode,
            plan,
            paymentMethod,
            cardNumber,
            expiryDate,
            cvv
        } = req.body;

        // Validate required fields
        if (!firstName || !lastName || !email || !phone || !plan) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields'
            });
        }

        const members = readMembers();
        const existingMemberIndex = members.findIndex(m => m.email === email);

        const renewalDate = new Date();
        if (plan === 'yearly') {
            renewalDate.setFullYear(renewalDate.getFullYear() + 1);
        } else {
            renewalDate.setMonth(renewalDate.getMonth() + 1);
        }

        const memberData = {
            firstName,
            lastName,
            email,
            phone,
            address,
            city,
            state,
            zipCode,
            plan,
            paymentMethod,
            status: 'active',
            joinDate: new Date().toISOString(),
            renewalDate: renewalDate.toISOString(),
            updatedAt: new Date().toISOString()
        };

        if (existingMemberIndex >= 0) {
            // Update existing member
            members[existingMemberIndex] = { ...members[existingMemberIndex], ...memberData };
        } else {
            // Create new member
            members.push(memberData);
        }

        writeMembers(members);

        res.json({
            success: true,
            message: existingMemberIndex >= 0 ? 'Membership updated successfully' : 'Membership created successfully',
            member: memberData
        });
    } catch (error) {
        console.error('Error in membership checkout:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

/**
 * GET /api/membership/:email
 * Get member details by email
 */
app.get('/api/membership/:email', async (req, res) => {
    try {
        const { email } = req.params;
        const members = readMembers();
        const member = members.find(m => m.email === email);

        if (!member) {
            return res.status(404).json({
                success: false,
                message: 'Member not found'
            });
        }

        res.json({
            success: true,
            member
        });
    } catch (error) {
        console.error('Error getting member:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

/**
 * PUT /api/membership/:email
 * Update member information
 */
app.put('/api/membership/:email', async (req, res) => {
    try {
        const { email } = req.params;
        const updateData = req.body;

        const members = readMembers();
        const memberIndex = members.findIndex(m => m.email === email);

        if (memberIndex === -1) {
            return res.status(404).json({
                success: false,
                message: 'Member not found'
            });
        }

        members[memberIndex] = {
            ...members[memberIndex],
            ...updateData,
            updatedAt: new Date().toISOString()
        };

        writeMembers(members);

        res.json({
            success: true,
            message: 'Member updated successfully',
            member: members[memberIndex]
        });
    } catch (error) {
        console.error('Error updating member:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

/**
 * DELETE /api/membership/:email
 * Cancel membership
 */
app.delete('/api/membership/:email', async (req, res) => {
    try {
        const { email } = req.params;
        const members = readMembers();
        const memberIndex = members.findIndex(m => m.email === email);

        if (memberIndex === -1) {
            return res.status(404).json({
                success: false,
                message: 'Member not found'
            });
        }

        members.splice(memberIndex, 1);
        writeMembers(members);

        res.json({
            success: true,
            message: 'Membership cancelled successfully'
        });
    } catch (error) {
        console.error('Error cancelling membership:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

/**
 * POST /api/membership/verify
 * Verify if member is active
 */
app.post('/api/membership/verify', async (req, res) => {
    try {
        const { email } = req.body;
        const members = readMembers();
        const member = members.find(m => m.email === email);

        if (!member) {
            return res.json({
                success: true,
                isMember: false,
                message: 'Not a member'
            });
        }

        const now = new Date();
        const renewalDate = new Date(member.renewalDate);
        const isActive = member.status === 'active' && renewalDate > now;

        res.json({
            success: true,
            isMember: true,
            isActive,
            member: {
                plan: member.plan,
                renewalDate: member.renewalDate,
                status: member.status
            }
        });
    } catch (error) {
        console.error('Error verifying membership:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

// ============ BOOKING ENDPOINTS ============

/**
 * POST /api/bookings
 * Create a new booking with automatic discount for members
 */
app.post('/api/bookings', async (req, res) => {
    try {
        const {
            groundId,
            groundName,
            date,
            time,
            duration,
            basePrice,
            email,
            name,
            phone
        } = req.body;

        // Validate required fields
        if (!groundId || !date || !time || !email || !name || !phone) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields'
            });
        }

        // Check if user is a member for discount
        const members = readMembers();
        const member = members.find(m => m.email === email);
        let discount = 0;
        let finalPrice = basePrice;

        if (member && member.status === 'active') {
            const renewalDate = new Date(member.renewalDate);
            if (renewalDate > new Date()) {
                discount = member.plan === 'yearly' ? 0.15 : 0.10; // 15% for yearly, 10% for monthly
                finalPrice = basePrice * (1 - discount);
            }
        }

        const booking = {
            id: Date.now().toString(),
            groundId,
            groundName,
            date,
            time,
            duration: duration || 1,
            basePrice,
            discount,
            finalPrice,
            email,
            name,
            phone,
            status: 'confirmed',
            createdAt: new Date().toISOString(),
            memberDiscount: discount > 0
        };

        const bookings = readBookings();
        bookings.push(booking);
        writeBookings(bookings);

        res.json({
            success: true,
            message: 'Booking created successfully',
            booking
        });
    } catch (error) {
        console.error('Error creating booking:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

/**
 * GET /api/bookings/:email
 * Get bookings for a specific user
 */
app.get('/api/bookings/:email', async (req, res) => {
    try {
        const { email } = req.params;
        const bookings = readBookings();
        const userBookings = bookings.filter(b => b.email === email);

        res.json({
            success: true,
            bookings: userBookings
        });
    } catch (error) {
        console.error('Error getting bookings:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

/**
 * GET /api/members
 * Get all members (admin endpoint)
 */
app.get('/api/members', async (req, res) => {
    try {
        const members = readMembers();
        res.json({
            success: true,
            members
        });
    } catch (error) {
        console.error('Error getting members:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

/**
 * GET /api/stats
 * Get system statistics
 */
app.get('/api/stats', async (req, res) => {
    try {
        const members = readMembers();
        const bookings = readBookings();

        const activeMembers = members.filter(m => {
            const renewalDate = new Date(m.renewalDate);
            return m.status === 'active' && renewalDate > new Date();
        });

        const totalRevenue = bookings.reduce((sum, b) => sum + b.finalPrice, 0);
        const memberRevenue = bookings.filter(b => b.memberDiscount).reduce((sum, b) => sum + b.finalPrice, 0);

        res.json({
            success: true,
            stats: {
                totalMembers: members.length,
                activeMembers: activeMembers.length,
                totalBookings: bookings.length,
                totalRevenue: Math.round(totalRevenue),
                memberRevenue: Math.round(memberRevenue),
                monthlyMembers: activeMembers.filter(m => m.plan === 'monthly').length,
                yearlyMembers: activeMembers.filter(m => m.plan === 'yearly').length
            }
        });
    } catch (error) {
        console.error('Error getting stats:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

/**
 * POST /api/chatbot
 * Chatbot endpoint using Gemini AI
 */
app.post('/api/chatbot', async (req, res) => {
    try {
        const { message } = req.body;

        if (!message) {
            return res.status(400).json({
                success: false,
                message: 'Message is required'
            });
        }

        const prompt = `You are a helpful chatbot for Sportify Spots, a sports ground booking platform. 
        Answer user questions about sports grounds, bookings, memberships, and general inquiries.
        Keep responses friendly and concise.
        
        User message: ${message}`;

        const result = await model.generateContent(prompt);
        const response = result.response.text();

        res.json({
            success: true,
            response: response.trim()
        });
    } catch (error) {
        console.error('Error with chatbot:', error);
        res.status(500).json({
            success: false,
            message: 'Sorry, I am unable to respond right now. Please try again later.'
        });
    }
});

module.exports = serverless(app);
