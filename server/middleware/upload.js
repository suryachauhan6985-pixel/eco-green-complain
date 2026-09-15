const multer = require('multer');
const path = require('path');
const fs = require('fs');

const defaultUploadsDir = fs.existsSync('/data') ? path.join('/data', 'uploads') : path.join(__dirname, '..', 'uploads');
const uploadsDir = process.env.UPLOAD_DIR || defaultUploadsDir;
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, 'egs-' + uniqueSuffix + ext);
  }
});

const fileFilter = (req, file, cb) => {
  // Allow images, pdfs, common document types
  const allowed = /jpeg|jpg|png|webp|gif|pdf|mp4|mov/;
  const extname = allowed.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowed.test(file.mimetype);

  if (extname || mimetype) {
    return cb(null, true);
  } else {
    cb(new Error('Only images, PDFs, and videos are allowed!'));
  }
};

const upload = multer({
  storage: storage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB limit
  fileFilter: fileFilter
});

module.exports = upload;
