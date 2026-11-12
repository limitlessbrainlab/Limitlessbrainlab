async function findAuthUserByEmail(db, email) {
  const normalized = email.trim().toLowerCase();
  // shortcut: Auth lookup is O(users); replace with a protected mapping at scale.
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 100 });
    if (error || !Array.isArray(data?.users)) throw error || new Error('Invalid Auth response');
    const user = data.users.find(user => user.email?.trim().toLowerCase() === normalized);
    if (user) return user;
    if (data.users.length < 100) return null;
  }
}
module.exports = { findAuthUserByEmail };
