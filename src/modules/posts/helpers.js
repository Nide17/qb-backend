// Simple expansion function for users
const populateOneUser = async (userId) => {

    if (!userId) return null;

    try {
        const usr = await getFromService(`${process.env.USERS_SERVICE_URL}/api/users/${userId}`);

        return usr ? {
            _id: usr._id,
            name: usr.name
        } : { _id: userId, name: 'Unknown User' };
    } catch (err) {
        return { _id: userId, name: 'Unknown User' };
    }
};

const populateBatchedUsers = async (usersIDs) => {

    if (!usersIDs || usersIDs.length === 0) return usersIDs;

    try {
        const response = await axios.post(`${process.env.USERS_SERVICE_URL}/api/users/batch`, { usersIDs }, { timeout: 20000 });
        const usersMap = new Map();
        for (const user of response.data || []) {
            usersMap.set(user._id.toString(), user);
        }
        return usersMap;
    } catch (err) {
        return new Map();
    }
};

module.exports = {
    populateOneUser,
    populateBatchedUsers,
};
