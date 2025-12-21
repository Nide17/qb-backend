const { getModels } = require('../../../utils/db-manager');
const { handleError } = require('../../../utils/error');
const { notifyAdmins, expandRoomsUsers, expandOneRoomUsers } = require('../helpers');
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

        // Pagination - ENFORCE pagination to prevent memory exhaustion
        const totalChatRooms = await ChatRoom.countDocuments({ users: req.params.id });
        const { query, pageNo, PAGE_SIZE } = findingQuery(req);

        if (pageNo && pageNo > 0) {
            const cacheKey = CACHE_KEYS.USER_PAGINATED(req.params.id, pageNo);

            const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {
                let userChatRooms = await ChatRoom.find({ users: req.params.id }, {}, query).lean();
                if (!userChatRooms || userChatRooms.length === 0) throw { 'status': 404, 'message': 'No chatRooms found for user' };
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
            const cacheKey = CACHE_KEYS.USER_ALL(req.params.id);
            const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {

                let userChatRooms = await ChatRoom.find({ users: req.params.id }).lean();
                if (!userChatRooms || userChatRooms.length === 0) throw { 'status': 404, 'message': 'No chatRooms found for user' };

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
        const { name, users } = req.body;

        // Validation
        validateRequiredFields([{ name: 'name', value: name }, { name: 'users', value: users }]);

        const { ChatRoom } = await getModels('contacts');

        const newRoom = new ChatRoom({ name, users });
        const savedRoom = await newRoom.save();
        if (!savedRoom) {
            throw { 'status': 500, 'message': 'Something went wrong during creation!' };
        }

        // Notify admins about the new chat room
        await notifyAdmins(savedRoom);
        await cacheManager.invalidatePattern("crm:*");
        res.status(200).json(savedRoom);
    } catch (err) {
        handleError(res, err);
    }
};

exports.createOpenChatRoom = async (req, res) => {
    const name = req.params.roomToOpen;
    const bodyUsers = req.body.users;

    try {
        const { ChatRoom } = await getModels('contacts');

        // 1. Check if room exists
        let chatroom = await ChatRoom.findOne({ name });

        if (chatroom) {
            chatroom = await expandOneRoomUsers(chatroom);
            return res.status(200).json(chatroom);
        }

        // 2. Create new room
        if (!Array.isArray(bodyUsers) || bodyUsers.length < 2) {
            throw { message: "Room must have two users", status: 400 };
        }

        const newRoom = new ChatRoom({ name, users: bodyUsers });
        const savedRoom = await newRoom.save();

        let created = await expandOneRoomUsers(savedRoom);
        res.status(200).json(created);
    } catch (err) {
        console.log(err);
        handleError(res, err);
    }
};

exports.updateChatRoom = async (req, res) => {
    try {
        const { ChatRoom } = await getModels('contacts');

        const updatedChatRoom = await ChatRoom.findByIdAndUpdate(req.params.id, req.body, { new: true });
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
