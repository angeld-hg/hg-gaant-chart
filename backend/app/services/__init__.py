"""Write services: validate a request, run the scheduling engine on stored data, persist.

Every function here runs inside one `db.write_tx`, so an error leaves the database untouched.
"""
