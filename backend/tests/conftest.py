import os
import tempfile

# Must run before any `app.database` import happens (including transitively
# via app.main), so tests never touch the real dev database file.
_tmp_dir = tempfile.mkdtemp(prefix="vexdiag_test_")
os.environ["VEXDIAG_DB_PATH"] = os.path.join(_tmp_dir, "test.db")
