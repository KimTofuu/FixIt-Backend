const express = require('express');
const router = express.Router();
const Authority = require('../models/Authority');

// Get all authorities
router.get('/', async (req, res) => {
  try {
    const authorities = await Authority.find({}).sort({ authorityName: 1 });
    res.json(authorities);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create new authority
router.post('/', async (req, res) => {
  const { authorityName, department, contactEmail } = req.body;
  
  try {
    const authority = new Authority({
      authorityName,
      department,
      contactEmail: contactEmail || `${authorityName.toLowerCase().replace(/\s+/g, '')}@example.com`
    });
    
    const newAuthority = await authority.save();
    res.status(201).json(newAuthority);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Update authority
router.patch('/:id', async (req, res) => {
  try {
    const authority = await Authority.findById(req.params.id);
    if (!authority) return res.status(404).json({ message: 'Authority not found' });
    
    if (req.body.authorityName) authority.authorityName = req.body.authorityName;
    if (req.body.department) authority.department = req.body.department;
    if (req.body.contactEmail) authority.contactEmail = req.body.contactEmail;
    
    const updatedAuthority = await authority.save();
    res.json(updatedAuthority);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Delete authority
router.delete('/:id', async (req, res) => {
  try {
    const authority = await Authority.findById(req.params.id);
    if (!authority) return res.status(404).json({ message: 'Authority not found' });
    
    await authority.deleteOne();
    res.json({ message: 'Authority deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;