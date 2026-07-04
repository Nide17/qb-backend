const { getModels } = require('../../../utils/db-manager');
const { handleError } = require('../../../utils/error');
const { expandRoomsUsers, expandOneRoomUsers, createChatRoom } = require('../helpers');
const { validateRequiredFields, cacheManager, cacheWrapper } = require('../../../utils/global-helpers');

const CACHE_TTL = 600; // 10 minutes
const CACHE_KEYS = {
    ALL: "crm:all",
    ONE: (id) => `crm:${id}`,
    PAGINATED: (pageNo) => `crm:page:${pageNo}`,
    USER_ALL: (id) => `crm:user:${id}`,
    USER_PAGINATED: (id, pageNo) => `crm:user:${id}:page:${pageNo}`
};

const findingQuery = (req) => {
    var PAGE_SIZE = 20; // Default page size
    var pageNo = parseInt(req.query.pageNo || '0'); // Default to at most 1 page to avoid mem leak
    var query = {};

    // Always enforce pagination - never load all chatRooms
    query.limit = PAGE_SIZE;
    query.skip = pageNo > 0 ? (pageNo - 1) * PAGE_SIZE : 0;

    return { query, pageNo, PAGE_SIZE };
}

const convertAnonymousRooms = async (anonymousRooms, userId) => {

    const { ChatRoom } = await getModels('contacts');

    const convertedRooms = await Promise.all(
        anonymousRooms.map(async (room) => {
            await ChatRoom.findByIdAndUpdate(
                room._id,
                {
                    $unset: { anonymous: "" }, // Remove anonymous field
                    $addToSet: { users: { $each: [userId] } } // Add both user and admin IDs (avoiding duplicates)
                }
            );

            // Return updated room
            return {
                ...room,
                users: [...new Set([...(room.users || []), userId])], // Merge and deduplicate for immediate use
                anonymous: undefined
            };
        })
    );

    return convertedRooms;
};

exports.getChatRooms = async (req, res) => {

    try {
        const { ChatRoom } = await getModels('contacts');

        // Pagination - ENFORCE pagination to prevent memory exhaustion
        const totalChatRooms = await ChatRoom.countDocuments({});
        const { query, pageNo, PAGE_SIZE } = findingQuery(req);

        if (pageNo && pageNo > 0) {

            const cacheKey = CACHE_KEYS.PAGINATED(pageNo);

            const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {

                let chatRooms = await ChatRoom.find({}, {}, query).sort({ createdAt: -1 }).lean();
                if (!chatRooms || chatRooms.length === 0) throw { 'status': 404, 'message': 'No chatRooms found' };

                // Expand chatRooms
                const expandedChatRooms = await expandRoomsUsers(chatRooms) || chatRooms;
                const result = { chatRooms: expandedChatRooms || chatRooms, totalPages: Math.ceil(totalChatRooms / PAGE_SIZE), currentPage: pageNo, pageSize: PAGE_SIZE, totalChatRooms };
                return result;
            });
            return res.status(200).json(data);
        }
        else {
            const cacheKey = CACHE_KEYS.ALL;

            const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {

                let chatRooms = await ChatRoom.find({}, {}, query).sort({ createdAt: -1 }).lean();
                if (!chatRooms || chatRooms.length === 0) throw { 'status': 404, 'message': 'No chatRooms found' };

                // Expand chatRooms
                const expandedChatRooms = await expandRoomsUsers(chatRooms) || chatRooms;
                const result = { chatRooms: expandedChatRooms || chatRooms, totalPages: Math.ceil(totalChatRooms / PAGE_SIZE), currentPage: pageNo, pageSize: PAGE_SIZE, totalChatRooms };
                return result;
            });
            return res.status(200).json(data);
        }
    } catch (err) {
        handleError(res, err);
    }
};

exports.getUserChatRooms = async (req, res) => {
    try {
        const { ChatRoom } = await getModels('contacts');
        const { User } = await getModels('users');
        const usr = await User.findById(req.params.id);

        if (!usr) throw { 'status': 404, 'message': 'User not found' };

        // Pagination - ENFORCE pagination to prevent memory exhaustion
        const totalChatRooms = await ChatRoom.countDocuments({ users: usr._id });
        const { query, pageNo, PAGE_SIZE } = findingQuery(req);

        if (pageNo && pageNo > 0) {
            const cacheKey = CACHE_KEYS.USER_PAGINATED(usr._id, pageNo);

            const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {
                let userChatRooms = await ChatRoom.find({ users: usr._id }, {}, query)
                    .sort({ createdAt: -1 })
                    .lean();

                if (!userChatRooms || userChatRooms.length === 0) {
                    // Find if anonymously sent to admin
                    let anonymousRooms = await ChatRoom.find({
                        'anonymous.email': usr.email
                    }, {}, query)
                        .sort({ createdAt: -1 })
                        .lean();

                    if (!anonymousRooms || anonymousRooms.length === 0) {
                        throw { 'status': 404, 'message': 'No chatRooms found for user' };
                    }

                    // For each anonymous room, remove anonymous entry and add the user id to users list along with admin id
                    userChatRooms = await convertAnonymousRooms(anonymousRooms, usr._id);
                }

                // Expand chatRooms
                const expandedChatRooms = await expandRoomsUsers(userChatRooms);
                const result = {
                    chatRooms: expandedChatRooms || userChatRooms,
                    totalPages: Math.ceil(totalChatRooms / PAGE_SIZE),
                    currentPage: pageNo,
                    pageSize: PAGE_SIZE,
                    totalChatRooms
                };
                return result;
            });
            res.status(200).json(data);
        } else {
            const cacheKey = CACHE_KEYS.USER_ALL(usr._id);
            const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {
                let userChatRooms = await ChatRoom.find({ users: usr._id }).lean();

                if (!userChatRooms || userChatRooms.length === 0) {
                    // Check anonymous rooms for non-paginated case too
                    let anonymousRooms = await ChatRoom.find({ 'anonymous.email': usr.email }).lean();
                    if (!anonymousRooms || anonymousRooms.length === 0) {
                        throw { 'status': 404, 'message': 'No chatRooms found for user' };
                    }
                    userChatRooms = await convertAnonymousRooms(anonymousRooms, usr._id);
                }

                // Expand chatRooms
                const expandedChatRooms = await expandRoomsUsers(userChatRooms);
                return expandedChatRooms || userChatRooms;
            });
            res.status(200).json(data);
        }
    } catch (err) {
        handleError(res, err);
    }
};

exports.getOneChatRoom = async (req, res) => {
    try {
        const cacheKey = CACHE_KEYS.ONE(req.params.id);
        const { ChatRoom } = await getModels('contacts');

        const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {
            let oneChatRoom = await ChatRoom.findById(req.params.id).lean();

            if (!oneChatRoom) throw { 'status': 404, 'message': 'ChatRoom not found' };

            oneChatRoom = await expandOneRoomUsers(oneChatRoom);
            return oneChatRoom;
        });
        res.status(200).json(data);
    } catch (err) {
        handleError(res, err);
    }

};

exports.createChatRoom = async (req, res) => {
    try {
        const { name, users, anonymous = false } = req.body;
        const { ChatRoom } = await getModels('contacts');

        // Validation
        if (!anonymous) {
            validateRequiredFields([
                { name: 'name', value: name },
                { name: 'users', value: users }
            ]);
        }

        // Build payload explicitly
        const roomPayload = anonymous
            ? { name, users, anonymous }
            : { name, users };

        const savedRoom = await ChatRoom.create(roomPayload);

        if (!savedRoom) {
            const error = new Error('Failed to create chat room');
            error.status = 500;
            throw error;
        }

        await cacheManager.invalidatePattern('crm:*');

        return res.status(201).json(savedRoom);

    } catch (err) {
        handleError(res, err);
    }
};

exports.createOpenChatRoom = async (req, res) => {
    try {
        const { roomToOpen: name } = req.params;
        const { users } = req.body;

        const { ChatRoom } = await getModels('contacts');

        // Return existing room (idempotent behavior)
        const existingRoom = await ChatRoom.findOne({ name });
        if (existingRoom) {
            const expanded = await expandOneRoomUsers(existingRoom);
            return res.status(200).json(expanded);
        }

        // Create room
        const createdRoom = await createChatRoom({ name, users, anonymous: false });

        const expandedRoom = await expandOneRoomUsers(createdRoom);

        return res.status(201).json(expandedRoom);

    } catch (err) {
        handleError(res, err);
    }
};

exports.updateChatRoom = async (req, res) => {
    try {
        const { ChatRoom } = await getModels('contacts');

        const updatedChatRoom = await ChatRoom.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after' });
        if (!updatedChatRoom) throw { message: 'Something went wrong during update!', status: 500 };
        await cacheManager.invalidatePattern("crm:*");
        res.status(200).json(updatedChatRoom);
    } catch (err) {
        handleError(res, err);
    }
};

exports.deleteChatRoom = async (req, res) => {
    try {
        const { ChatRoom, RoomMessage } = await getModels('contacts');

        await RoomMessage.deleteMany({ room: req.params.id });

        const deletedChatRoom = await ChatRoom.findByIdAndDelete(req.params.id);
        if (!deletedChatRoom) throw { message: 'Something went wrong during deletion!', status: 500 };
        await cacheManager.invalidatePattern("crm:*");
        res.status(200).json(deletedChatRoom);
    } catch (err) {
        handleError(res, err);
    }
};
