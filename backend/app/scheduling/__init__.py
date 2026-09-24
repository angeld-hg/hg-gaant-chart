"""Pure scheduling and critical-path engine.

Nothing in this package may import the database or HTTP layers; the services call it
inside their write transaction and persist whatever it returns.
"""
