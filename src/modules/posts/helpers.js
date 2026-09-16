// const twilioSID = process.env.TWILIO_ACCOUNT_SID
// const twilioToken = process.env.TWILIO_AUTH_TOKEN
// const client = require('twilio')(twilioSID, twilioToken)

const { getModels } = require('../../utils/db-manager');
const { sendHtmlEmail } = require('../../utils/emails/sendEmail');
const { getBatchedNotesMap } = require('../courses/helpers');
const { getBatchedQuizzesMap } = require('../quizzing/helpers');

// const _from = 'whatsapp:+14155238886'; // Twilio WhatsApp Sandbox number
// const _numbers = ['whatsapp:+250786791577', 'whatsapp:+250738140795'];

const getDailyBlogViewsReport = async (todayDate) => {
    try {
        const { BlogPostsView } = await getModels('posts');

        const result = await BlogPostsView.aggregate([
            { $match: { createdAt: { $gte: todayDate } } },
            { $group: { _id: { blogPost: '$blogPost', country: '$country', device: '$device' }, count: { $sum: 1 } } },
            { $sort: { '_id.country': 1, '_id.device': 1 } },
            { $group: { _id: '$_id.blogPost', countries: { $push: { country: '$_id.country', device: '$_id.device', count: '$count' } }, count: { $sum: '$count' } } },
            { $sort: { '_id': 1 } },
            { $lookup: { from: 'blogposts', localField: '_id', foreignField: '_id', as: 'blogPost' } },
            { $unwind: '$blogPost' },
            { $project: { _id: 0, blogPost: '$blogPost.title', countries: 1, count: 1 } }
        ]).exec();

        return processReportData(result);
    } catch (err) {
        console.error('Error fetching daily blog views report:', err?.message);
        return null;
    }
};

const getDailyDownloadsReport = async (todayDate) => {
    try {
        const { Download } = await getModels('downloads');

        const downloads = await Download.aggregate([
            { $match: { createdAt: { $gte: todayDate } } },
            { $group: { _id: '$notes', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]).exec();

        const notesIDs = [...new Set(downloads
            .map(item => item._id)
            .filter(Boolean)
            .map(id => id.toString()))];
        const notesMap = await getBatchedNotesMap(notesIDs);

        return downloads.map(item => {
            const noteId = item._id?.toString();
            const note = noteId ? notesMap.get(noteId) : null;
            return {
                note: item._id,
                title: note?.title || 'Unknown Note',
                count: item.count
            };
        });
    } catch (err) {
        console.error('Error fetching daily downloads report:', err?.message);
        return [];
    }
};

const getDailyQuizReport = async (todayDate) => {
    try {
        const { Score } = await getModels('scores');

        const quizzes = await Score.aggregate([
            { $match: { test_date: { $gte: todayDate } } },
            { $group: { _id: '$quiz', attempts: { $sum: 1 }, avgMarks: { $avg: '$marks' }, avgOutOf: { $avg: '$out_of' } } },
            { $sort: { attempts: -1 } }
        ]).exec();

        const quizzesIDs = [...new Set(quizzes
            .map(item => item._id)
            .filter(Boolean)
            .map(id => id.toString()))];
        const quizzesMap = await getBatchedQuizzesMap(quizzesIDs);

        return quizzes.map(item => {
            const quizId = item._id?.toString();
            const quiz = quizId ? quizzesMap.get(quizId) : null;
            return {
                quiz: item._id,
                title: quiz?.title || 'Unknown Quiz',
                attempts: item.attempts,
                avgMarks: item.avgMarks,
                avgOutOf: item.avgOutOf
            };
        });
    } catch (err) {
        console.error('Error fetching daily quiz report:', err?.message);
        return [];
    }
};

const getDailyReport = async (todayDate) => {
    const [blogViews, downloads, quizzes] = await Promise.all([
        getDailyBlogViewsReport(todayDate),
        getDailyDownloadsReport(todayDate),
        getDailyQuizReport(todayDate)
    ]);

    return {
        blogViews: blogViews || { totalViewsCount: 0, uniqueCountriesCount: [], uniqueDevicesCount: [], blogPostsViews: [] },
        downloads: downloads || [],
        quizzes: quizzes || []
    };
};

const processReportData = (result) => {
    let totalViewsCount = 0;
    const uniqueCountries = new Set();
    const uniqueCountriesCount = [];
    const uniqueDevices = new Set();
    const uniqueDevicesCount = [];
    const blogPostsViews = [];

    result.forEach(blogPost => {
        totalViewsCount += blogPost.count;
        blogPost.countries.forEach(country => {
            if (!uniqueCountries.has(country.country)) {
                uniqueCountries.add(country.country);
                uniqueCountriesCount.push({ country: country.country, count: country.count });
            } else {
                uniqueCountriesCount.find(uniqueCountry => uniqueCountry.country === country.country).count += country.count;
            }
            if (!uniqueDevices.has(country.device)) {
                uniqueDevices.add(country.device);
                uniqueDevicesCount.push({ device: country.device, count: country.count });
            } else {
                uniqueDevicesCount.find(uniqueDevice => uniqueDevice.device === country.device).count += country.count;
            }
        });
        blogPostsViews.push({ blogPost: blogPost.blogPost, count: blogPost.count });
    });

    return { totalViewsCount, uniqueCountriesCount, uniqueDevicesCount, blogPostsViews };
};

const generateReportMessage = (report, currentDate) => {
    const blogViews = report?.blogViews || {};
    const downloads = report?.downloads || [];
    const quizzes = report?.quizzes || [];
    const totalDownloads = downloads.reduce((sum, item) => sum + item.count, 0);
    const totalQuizAttempts = quizzes.reduce((sum, item) => sum + item.attempts, 0);

    let reportMessage = `*TODAY, ${currentDate} DAILY ACTIVITY REPORT* \n\n`;
    reportMessage += '*BLOG POSTS VIEWS* \n';
    reportMessage += `*Total Views:* ${blogViews.totalViewsCount || 0} \n`;
    reportMessage += '*Unique Countries:* \n';
    (blogViews.uniqueCountriesCount || []).forEach(country => reportMessage += `${country.country}: ${country.count} \n`);
    reportMessage += '*Unique Devices:* \n';
    (blogViews.uniqueDevicesCount || []).forEach(device => reportMessage += `${device.device}: ${device.count} \n`);
    reportMessage += '*Blog Posts Views:* \n';
    (blogViews.blogPostsViews || []).forEach(blogPost => reportMessage += `${blogPost.blogPost}: ${blogPost.count} \n`);

    reportMessage += '\n*DOWNLOADS REPORT* \n';
    reportMessage += `*Total Downloads:* ${totalDownloads} \n`;
    if (downloads.length === 0) {
        reportMessage += 'No downloads today \n';
    } else {
        downloads.forEach(item => reportMessage += `${item.title}: ${item.count} \n`);
    }

    reportMessage += '\n*QUIZ TAKING REPORT* \n';
    reportMessage += `*Total Attempts:* ${totalQuizAttempts} \n`;
    if (quizzes.length === 0) {
        reportMessage += 'No quiz attempts today \n';
    } else {
        quizzes.forEach(item => {
            const avgScore = item.avgOutOf ? `${(item.avgMarks || 0).toFixed(1)}/${item.avgOutOf}` : (item.avgMarks || 0).toFixed(1);
            reportMessage += `${item.title}: ${item.attempts} attempt${item.attempts === 1 ? '' : 's'} (avg score: ${avgScore}) \n`;
        });
    }

    return reportMessage;
};

const generateReportEmail = (report, currentDate) => {
    const blogViews = report?.blogViews || {};
    const downloads = report?.downloads || [];
    const quizzes = report?.quizzes || [];
    const totalDownloads = downloads.reduce((sum, item) => sum + item.count, 0);
    const totalQuizAttempts = quizzes.reduce((sum, item) => sum + item.attempts, 0);

    return {
        subject: `TODAY, ${currentDate} DAILY ACTIVITY REPORT`,
        html: `
            <h3 style="color: blue"><u>Daily Activity Report for ${currentDate}</u></h3>

            <h4><u>Blog Posts Views</u></h4>
            <p><strong>Total Views:</strong> ${blogViews.totalViewsCount || 0}</p>
            <h5>Unique Countries:</h5>
            <ul>${(blogViews.uniqueCountriesCount || []).map(country => `<li>${country.country}: ${country.count}</li>`).join('')}</ul>
            <h5>Unique Devices:</h5>
            <ul>${(blogViews.uniqueDevicesCount || []).map(device => `<li>${device.device}: ${device.count}</li>`).join('')}</ul>
            <h5>Blog Posts Views:</h5>
            <ul>${(blogViews.blogPostsViews || []).map(blogPost => `<li>${blogPost.blogPost}: ${blogPost.count}</li>`).join('')}</ul>

            <h4><u>Downloads</u></h4>
            <p><strong>Total Downloads:</strong> ${totalDownloads}</p>
            ${downloads.length > 0 ? `<ul>${downloads.map(item => `<li>${item.title}: ${item.count}</li>`).join('')}</ul>` : '<p>No downloads today</p>'}

            <h4><u>Quiz Taking</u></h4>
            <p><strong>Total Attempts:</strong> ${totalQuizAttempts}</p>
            ${quizzes.length > 0 ? `<ul>${quizzes.map(item => {
                const avgScore = item.avgOutOf ? `${(item.avgMarks || 0).toFixed(1)}/${item.avgOutOf}` : (item.avgMarks || 0).toFixed(1);
                return `<li>${item.title}: ${item.attempts} attempt${item.attempts === 1 ? '' : 's'} (avg score: ${avgScore})</li>`;
            }).join('')}</ul>` : '<p>No quiz attempts today</p>'}
        `
    };
};

const sendReport = async (reportMessage, reportMessageEmail, adminsEmails) => {
    // numbers.forEach(to => {
    //     client.messages.create({ from, to, body: reportMessage })
    //         .then(message => console.log(message.sid))
    //         .catch(error => console.error(error));
    // });
    if (!adminsEmails || adminsEmails.length === 0) {
        console.log('No admin emails found for report');
        return;
    }
    adminsEmails.forEach(admEmail => {
        const email = typeof admEmail === 'string' ? admEmail : admEmail.email;
        if (email) sendHtmlEmail(email, reportMessageEmail.subject, reportMessageEmail.html);
    });
};

const fetchAdminEmails = async () => {
    let attempts = 0;
    const maxAttempts = 2;
    const retryDelay = 60000; // 1 minute in ms

    const { User } = await getModels('users');

    while (attempts < maxAttempts) {
        try {
            const adminEmails = await User.find({ role: { $in: ['Admin', 'SuperAdmin'] } }).select('email').lean().maxTimeMS(60000);

            if (adminEmails && adminEmails.length > 0) {
                return adminEmails.map(admin => admin.email).filter(Boolean);
            } else {
                return [];
            }
        } catch (error) {
            attempts++;
            console.log(`Failed to fetch admin emails for report (attempt ${attempts}):`, error);
            if (attempts < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, retryDelay));
            } else {
                return [];
            }
        }
    }
};

const scheduledReportMessage = async () => {
    try {
        const scheduleNextSend = () => {
            const now = new Date();
            const scheduleDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
            if (now >= scheduleDate) {
                scheduleDate.setDate(scheduleDate.getDate() + 1);
            }
            const delay = scheduleDate - now;
            console.log(`Next daily report scheduled for ${scheduleDate.toLocaleString()}`);

            setTimeout(async () => {
                try {
                    console.log('Sending scheduled report...');
                    const sendDate = new Date();
                    const todayDate = new Date(sendDate.getFullYear(), sendDate.getMonth(), sendDate.getDate());
                    const currentDate = `${sendDate.getMonth() + 1}/${sendDate.getDate()}/${sendDate.getFullYear()}`;
                    const report = await getDailyReport(todayDate);
                    const reportMessage = generateReportMessage(report, currentDate);
                    const reportMessageEmail = generateReportEmail(report, currentDate);
                    const adminsEmails = await fetchAdminEmails();
                    await sendReport(reportMessage, reportMessageEmail, adminsEmails);
                } catch (error) {
                    console.log('Error sending scheduled report:', error.message);
                } finally {
                    scheduleNextSend();
                }
            }, delay);
        };

        scheduleNextSend();
    } catch (error) {
        console.log('Error setting up scheduled report:', error.message);
    }
};

module.exports = { scheduledReportMessage };
