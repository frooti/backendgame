import random

nums = [x for x in range(1, 11)]

def randomdigits():
	random.shuffle(nums)
	return nums[:3]

import redis

def connect():
	# pop satoshi from queue
	
	# else enqueue