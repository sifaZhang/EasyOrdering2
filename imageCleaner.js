const cron = require('node-cron');
const fs = require('fs');
const path = require('path');

var conn = require('./dbConfig');

// 每天凌晨 2 点执行
cron.schedule('0 13 * * *', () => {
    console.log('Running image cleanup task...');

    conn.query('SELECT * FROM deleted_images', function (error, results) {
        if (error) {
            console.error('Database error (deleted_images):', error);
            return;
        }

        if (results.length === 0) {
            console.log('No images to delete.');
            return;
        }

        results.forEach((image) => {
            const picture = image.image_path;
            const relativePath = picture.startsWith('/') ? picture.slice(1) : picture;
            const filePath = path.join(__dirname, 'public/images', relativePath);

            console.log('Attempting to delete file at:', filePath);

            fs.unlink(filePath, (err) => {
                if (err) {
                    console.error('Failed to delete image:', err.message);
                } else {
                    console.log('Image deleted:', filePath);

                    // 删除数据库记录
                    conn.query('DELETE FROM deleted_images WHERE id = ?', [image.id], (err2) => {
                        if (err2) {
                            console.error('Failed to delete DB record:', err2);
                        } else {
                            console.log('DB record deleted for image ID:', image.id);
                        }
                    });
                }
            });
        });
    });
});